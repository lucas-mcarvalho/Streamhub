package com.streamhub.library;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.streamhub.config.AppSettingsService;

/**
 * Escolhe como o ffmpeg converte vídeo para H.264: GPU Intel/AMD (VAAPI), GPU NVIDIA (NVENC) ou processador.
 * Cada opção é testada de verdade no servidor; o que falhar é ignorado e a conversão cai para a próxima.
 */
@Component
public class VideoAccel {
    private static final Logger log = LoggerFactory.getLogger(VideoAccel.class);
    static final String MODE_KEY = "video.accel";

    public enum Kind { VAAPI, NVENC, CPU }

    public record Encoder(Kind kind, String device, String label) {}

    public record Status(String mode, Encoder active, List<Encoder> available) {}

    private final AppSettingsService settings;
    private volatile List<Encoder> available;
    /** Se a GPU decodifica um codec/formato (ex.: "VAAPI|hevc|yuv420p10le"); medido no primeiro arquivo de cada tipo. */
    private final Map<String, Boolean> gpuDecode = new ConcurrentHashMap<>();

    public VideoAccel(AppSettingsService settings) { this.settings = settings; }

    @EventListener(ApplicationReadyEvent.class)
    public void detectOnStartup() {
        Thread.ofVirtual().start(this::available);
    }

    public String mode() { return "cpu".equals(settings.getString(MODE_KEY, "auto")) ? "cpu" : "auto"; }

    public void setMode(String mode) { settings.setString(MODE_KEY, "cpu".equals(mode) ? "cpu" : "auto"); }

    public Status status() { return new Status(mode(), active(), available()); }

    public synchronized void redetect() {
        available = null;
        gpuDecode.clear();
        available();
    }

    public Encoder active() {
        if ("cpu".equals(mode())) return cpu();
        return available().stream().findFirst().orElse(cpu());
    }

    /** Opções de GPU que funcionam neste servidor, em ordem de preferência (integrada primeiro: gasta menos energia). */
    public synchronized List<Encoder> available() {
        if (available != null) return available;
        List<Encoder> found = new ArrayList<>();
        for (Path node : renderNodes()) {
            String vendor = vendorOf(node);
            if ("NVIDIA".equals(vendor)) continue; // NVIDIA não usa VAAPI; vai pelo NVENC abaixo
            if (works(List.of("-init_hw_device", "vaapi=va:" + node, "-filter_hw_device", "va"),
                List.of("-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi"))) {
                found.add(new Encoder(Kind.VAAPI, node.toString(), "GPU " + (vendor == null ? "integrada" : vendor) + " (VAAPI)"));
            }
        }
        if (works(List.of(), List.of("-pix_fmt", "yuv420p", "-c:v", "h264_nvenc"))) found.add(new Encoder(Kind.NVENC, null, "GPU NVIDIA (NVENC)"));
        log.info("Aceleração de vídeo disponível: {}", found.isEmpty() ? "nenhuma (usando o processador)" : found.stream().map(Encoder::label).toList());
        available = List.copyOf(found);
        return available;
    }

    /** Argumentos do ffmpeg antes do -i e depois do mapeamento, para converter o vídeo com a melhor opção disponível. */
    public record Plan(List<String> input, List<String> video) {}

    public Plan plan(Path file, LibraryService.MediaInfo info) {
        Encoder enc = active();
        if (enc.kind() == Kind.CPU) return cpuPlan();
        String key = enc.kind() + "|" + enc.device() + "|" + info.videoCodec() + "|" + info.pixFmt();
        boolean full = gpuDecode.computeIfAbsent(key, k -> {
            Plan p = gpuPlan(enc, true);
            boolean ok = run(20, cmd(p.input(), List.of("-i", file.toString(), "-t", "2", "-map", "0:v:0"), p.video()));
            log.info("{} decodifica {} {} na GPU: {}", enc.label(), info.videoCodec(), info.pixFmt(), ok ? "sim" : "não (decodificação no processador)");
            return ok;
        });
        return gpuPlan(enc, full);
    }

    private static Plan cpuPlan() {
        return new Plan(List.of(), List.of("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"));
    }

    /** {@code full}: o vídeo fica na GPU do começo ao fim; senão, decodifica no processador e só codifica na GPU. */
    private static Plan gpuPlan(Encoder enc, boolean full) {
        List<String> in = new ArrayList<>();
        List<String> out = new ArrayList<>();
        if (enc.kind() == Kind.VAAPI) {
            in.addAll(List.of("-init_hw_device", "vaapi=va:" + enc.device(), "-filter_hw_device", "va"));
            if (full) in.addAll(List.of("-hwaccel", "vaapi", "-hwaccel_device", "va", "-hwaccel_output_format", "vaapi"));
            out.addAll(List.of("-vf", full ? "scale_vaapi=format=nv12" : "format=nv12,hwupload", "-c:v", "h264_vaapi", "-qp", "23"));
        } else {
            if (full) in.addAll(List.of("-hwaccel", "cuda", "-hwaccel_output_format", "cuda"));
            out.addAll(full ? List.of("-vf", "scale_cuda=format=yuv420p") : List.of("-pix_fmt", "yuv420p"));
            out.addAll(List.of("-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"));
        }
        out.addAll(List.of("-g", "120"));
        return new Plan(in, out);
    }

    private static Encoder cpu() { return new Encoder(Kind.CPU, null, "Processador (libx264)"); }

    private static boolean works(List<String> input, List<String> video) {
        return run(20, cmd(input, List.of("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-t", "0.5"), video));
    }

    private static List<String> cmd(List<String> input, List<String> source, List<String> video) {
        List<String> c = new ArrayList<>(List.of("ffmpeg", "-v", "error", "-nostdin"));
        c.addAll(input);
        c.addAll(source);
        c.addAll(video);
        c.addAll(List.of("-f", "null", "-"));
        return c;
    }

    private static boolean run(long timeoutSeconds, List<String> cmd) {
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) { p.destroyForcibly(); return false; }
            return p.exitValue() == 0;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static List<Path> renderNodes() {
        try (Stream<Path> s = Files.list(Path.of("/dev/dri"))) {
            return s.filter(p -> p.getFileName().toString().startsWith("renderD")).sorted().toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private static String vendorOf(Path node) {
        try {
            String id = Files.readString(Path.of("/sys/class/drm", node.getFileName().toString(), "device/vendor"), StandardCharsets.US_ASCII).trim();
            return switch (id) {
                case "0x8086" -> "Intel";
                case "0x1002" -> "AMD";
                case "0x10de" -> "NVIDIA";
                default -> null;
            };
        } catch (IOException e) {
            return null;
        }
    }
}
