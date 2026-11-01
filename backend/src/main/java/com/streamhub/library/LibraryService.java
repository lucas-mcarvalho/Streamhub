package com.streamhub.library;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.streamhub.config.ApiException;
import com.streamhub.storage.StorageLocation;
import com.streamhub.storage.StorageLocationRepository;
import com.streamhub.storage.StorageService;

@Service
public class LibraryService {
    private static final Set<String> VIDEO = Set.of("mkv", "mp4", "m4v", "avi", "mov", "webm", "ts", "wmv");
    private static final Pattern SXXEYY = Pattern.compile("[Ss](\\d{1,2})[Ee](\\d{1,4})|(\\d{1,2})x(\\d{2,4})");

    public record Track(String type, String codec, String language, String title) {}

    public record AudioTrack(int index, String codec, String language, String title, int channels) {}

    public record SubTrack(int index, String codec, String language, String title, boolean textBased) {}

    public record MediaInfo(double duration, String videoCodec, String pixFmt, boolean directPlay,
                            List<AudioTrack> audio, List<SubTrack> subtitles) {}

    private static final Set<String> TEXT_SUBS = Set.of("subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text");
    private final java.util.Map<String, MediaInfo> infoCache = new java.util.concurrent.ConcurrentHashMap<>();

    private final StorageLocationRepository locations;
    private final StorageService storage;
    private final String secret;

    public LibraryService(StorageLocationRepository locations, StorageService storage, @Value("${streamhub.secret}") String secret) {
        this.locations = locations;
        this.storage = storage;
        this.secret = secret;
    }

    private static String encodeId(long locId, String rel) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((locId + "|" + rel).getBytes(StandardCharsets.UTF_8));
    }

    /** Resolve o id opaco para um arquivo de vídeo dentro de um local registrado. */
    public Path resolve(String id) {
        try {
            String raw = new String(Base64.getUrlDecoder().decode(id), StandardCharsets.UTF_8);
            int i = raw.indexOf('|');
            StorageLocation loc = storage.get(Long.parseLong(raw.substring(0, i)));
            Path p = storage.resolveDestination(loc, raw.substring(i + 1));
            if (!Files.isRegularFile(p) || !VIDEO.contains(ext(p))) throw new IllegalArgumentException();
            return p;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NO_FILE", "Arquivo não encontrado");
        }
    }

    private static String ext(Path p) {
        String n = p.getFileName().toString();
        int dot = n.lastIndexOf('.');
        return dot < 0 ? "" : n.substring(dot + 1).toLowerCase();
    }

    public List<LibraryFile> list(String kind) {
        List<LibraryFile> out = new ArrayList<>();
        for (StorageLocation loc : locations.findAll()) {
            if (kind != null && !kind.isBlank() && !loc.getKind().equalsIgnoreCase(kind)) continue;
            Path base = Path.of(loc.getPath());
            if (!Files.isDirectory(base)) continue;
            try (Stream<Path> s = Files.walk(base, 6)) {
                s.filter(Files::isRegularFile).filter(p -> VIDEO.contains(ext(p))).forEach(p -> {
                    String rel = base.relativize(p).toString().replace('\\', '/');
                    String fileName = p.getFileName().toString();
                    String group = rel.contains("/") ? rel.substring(0, rel.indexOf('/')) : fileName.replaceFirst("\\.[^.]+$", "");
                    Matcher m = SXXEYY.matcher(fileName);
                    Integer season = null, ep = null;
                    if (m.find()) {
                        season = Integer.valueOf(m.group(1) != null ? m.group(1) : m.group(3));
                        ep = Integer.valueOf(m.group(2) != null ? m.group(2) : m.group(4));
                    }
                    try {
                        out.add(new LibraryFile(encodeId(loc.getId(), rel), fileName, group, loc.getKind(), Files.size(p),
                            Files.getLastModifiedTime(p).toInstant(), season, ep, loc.getName(), rel));
                    } catch (IOException ignored) {
                        // arquivo sumiu durante a varredura
                    }
                });
            } catch (IOException e) {
                // pasta ilegível: ignorada
            }
        }
        out.sort(Comparator.comparing(LibraryFile::group, String.CASE_INSENSITIVE_ORDER)
            .thenComparing(f -> f.season() == null ? 0 : f.season()).thenComparing(f -> f.episode() == null ? 0 : f.episode()));
        return out;
    }

    /** Lê as faixas reais de áudio/legenda com ffprobe (quando instalado). */
    public List<Track> tracks(String id) {
        Path p = resolve(id);
        try {
            Process pr = new ProcessBuilder("ffprobe", "-v", "error", "-show_entries",
                "stream=codec_type,codec_name:stream_tags=language,title", "-of", "compact=p=0", p.toString())
                .redirectErrorStream(true).start();
            String output = new String(pr.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!pr.waitFor(30, TimeUnit.SECONDS)) pr.destroyForcibly();
            List<Track> out = new ArrayList<>();
            for (String line : output.split("\n")) {
                String type = null, codec = null, lang = null, title = null;
                for (String kv : line.trim().split("\\|")) {
                    String[] a = kv.split("=", 2);
                    if (a.length < 2) continue;
                    switch (a[0]) {
                        case "codec_type" -> type = a[1];
                        case "codec_name" -> codec = a[1];
                        case "tag:language" -> lang = a[1];
                        case "tag:title" -> title = a[1];
                        default -> { }
                    }
                }
                if ("audio".equals(type) || "subtitle".equals(type)) out.add(new Track(type, codec, lang, title));
            }
            return out;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFPROBE", "ffprobe não está disponível no servidor");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    private String run(long timeoutSeconds, String... cmd) throws IOException, InterruptedException {
        Process pr = new ProcessBuilder(cmd).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        byte[] out = pr.getInputStream().readAllBytes();
        if (!pr.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            pr.destroyForcibly();
            throw new IOException("tempo esgotado");
        }
        return new String(out, StandardCharsets.UTF_8);
    }

    /** Lê codecs, duração e faixas do arquivo e decide se o navegador consegue reproduzi-lo diretamente. */
    public MediaInfo info(String id) {
        Path p = resolve(id);
        String key = p + "|" + p.toFile().lastModified();
        MediaInfo cached = infoCache.get(key);
        if (cached != null) return cached;
        try {
            String output = run(30, "ffprobe", "-v", "error", "-show_entries",
                "stream=codec_type,codec_name,pix_fmt,channels:stream_tags=language,title:format=duration",
                "-of", "compact=p=0", p.toString());
            double duration = 0;
            String vcodec = null, pix = null;
            List<AudioTrack> audio = new ArrayList<>();
            List<SubTrack> subs = new ArrayList<>();
            for (String line : output.split("\n")) {
                java.util.Map<String, String> kv = new java.util.HashMap<>();
                for (String part : line.trim().split("\\|")) {
                    String[] a = part.split("=", 2);
                    if (a.length == 2) kv.put(a[0], a[1]);
                }
                String type = kv.get("codec_type");
                if (type == null && kv.containsKey("duration")) {
                    try { duration = Double.parseDouble(kv.get("duration")); } catch (NumberFormatException ignored) { }
                } else if ("video".equals(type) && vcodec == null) {
                    vcodec = kv.get("codec_name");
                    pix = kv.get("pix_fmt");
                } else if ("audio".equals(type)) {
                    int ch = 2;
                    try { ch = Integer.parseInt(kv.getOrDefault("channels", "2")); } catch (NumberFormatException ignored) { }
                    audio.add(new AudioTrack(audio.size(), kv.get("codec_name"), kv.get("tag:language"), kv.get("tag:title"), ch));
                } else if ("subtitle".equals(type)) {
                    String codec = kv.get("codec_name");
                    subs.add(new SubTrack(subs.size(), codec, kv.get("tag:language"), kv.get("tag:title"), TEXT_SUBS.contains(codec)));
                }
            }
            String ext = ext(p);
            boolean directPlay = Set.of("mp4", "m4v", "webm", "mkv").contains(ext)
                && vcodec != null && Set.of("h264", "vp8", "vp9", "av1").contains(vcodec)
                && "yuv420p".equals(pix)
                && (audio.isEmpty() || Set.of("aac", "mp3", "opus", "vorbis", "flac").contains(audio.get(0).codec()));
            MediaInfo info = new MediaInfo(duration, vcodec, pix, directPlay, audio, subs);
            infoCache.put(key, info);
            return info;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFPROBE", "ffprobe não está disponível ou falhou");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Inicia o ffmpeg gerando MP4 fragmentado (vídeo copiado quando possível, áudio em AAC estéreo). */
    public Process startTranscode(String id, double start, int audioIndex) {
        Path p = resolve(id);
        MediaInfo info = info(id);
        boolean copyVideo = "h264".equals(info.videoCodec()) && "yuv420p".equals(info.pixFmt());
        List<String> cmd = new ArrayList<>(List.of("ffmpeg", "-v", "error", "-nostdin"));
        if (start > 0) cmd.addAll(List.of("-ss", String.valueOf(start)));
        cmd.addAll(List.of("-i", p.toString(), "-map", "0:v:0"));
        if (!info.audio().isEmpty()) cmd.addAll(List.of("-map", "0:a:" + Math.max(0, Math.min(audioIndex, info.audio().size() - 1))));
        if (copyVideo) cmd.addAll(List.of("-c:v", "copy"));
        else cmd.addAll(List.of("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"));
        cmd.addAll(List.of("-c:a", "aac", "-b:a", "192k", "-ac", "2", "-sn",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"));
        try {
            return new ProcessBuilder(cmd).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFMPEG", "ffmpeg não está disponível no servidor");
        }
    }

    /** Extrai uma legenda de texto como WebVTT. */
    public String subtitleVtt(String id, int index) {
        Path p = resolve(id);
        MediaInfo info = info(id);
        if (index < 0 || index >= info.subtitles().size()) throw new ApiException(HttpStatus.NOT_FOUND, "NO_SUB", "Legenda não encontrada");
        if (!info.subtitles().get(index).textBased()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "IMAGE_SUB", "Legenda em imagem não é suportada");
        }
        try {
            return run(90, "ffmpeg", "-v", "error", "-nostdin", "-i", p.toString(), "-map", "0:s:" + index, "-f", "webvtt", "pipe:1");
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SUB_FAILED", "Não foi possível extrair a legenda");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Apaga os arquivos de vídeo informados e remove as pastas que ficarem vazias (sem sair do local registrado). */
    public int delete(List<String> ids) {
        int deleted = 0;
        for (String id : ids) {
            Path p = resolve(id);
            StorageLocation loc;
            try {
                String raw = new String(Base64.getUrlDecoder().decode(id), StandardCharsets.UTF_8);
                loc = storage.get(Long.parseLong(raw.substring(0, raw.indexOf('|'))));
            } catch (RuntimeException e) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NO_FILE", "Arquivo não encontrado");
            }
            Path base = Path.of(loc.getPath()).toAbsolutePath().normalize();
            try {
                Files.delete(p);
                deleted++;
                Path dir = p.getParent();
                while (dir != null && !dir.equals(base) && dir.startsWith(base)) {
                    try (Stream<Path> s = Files.list(dir)) {
                        if (s.findAny().isPresent()) break;
                    }
                    Files.delete(dir);
                    dir = dir.getParent();
                }
            } catch (IOException e) {
                throw new ApiException(HttpStatus.FORBIDDEN, "DELETE_FAILED", "Não foi possível apagar: " + e.getMessage());
            }
        }
        return deleted;
    }

    // ---------- miniatura do ponto em que o usuário parou ----------

    private final java.util.Map<String, byte[]> thumbCache = java.util.Collections.synchronizedMap(
        new java.util.LinkedHashMap<>(64, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(java.util.Map.Entry<String, byte[]> eldest) { return size() > 400; }
        });
    private final java.util.concurrent.Semaphore thumbSlots = new java.util.concurrent.Semaphore(3);

    /** Quadro JPEG do vídeo na posição indicada (arredondada a 5 s para aproveitar o cache). */
    public byte[] thumbnail(String id, double seconds, int width) {
        Path p = resolve(id);
        int w = Math.max(160, Math.min(width, 960));
        long at = Math.max(0, Math.round(seconds / 5.0) * 5);
        String key = id + "|" + at + "|" + w;
        byte[] cached = thumbCache.get(key);
        if (cached != null) return cached;
        try {
            thumbSlots.acquire();
            try {
                byte[] img = frame(p, at, w);
                if (img.length == 0 && at > 0) img = frame(p, 0, w); // posição além do fim: usa o início
                if (img.length == 0) throw new ApiException(HttpStatus.NOT_FOUND, "NO_FRAME", "Não foi possível gerar a miniatura");
                thumbCache.put(key, img);
                return img;
            } finally {
                thumbSlots.release();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFMPEG", "ffmpeg não está disponível no servidor");
        }
    }

    private byte[] frame(Path p, long at, int width) throws IOException, InterruptedException {
        Process pr = new ProcessBuilder("ffmpeg", "-v", "error", "-nostdin", "-ss", String.valueOf(at), "-i", p.toString(),
            "-frames:v", "1", "-vf", "scale=" + width + ":-2", "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1")
            .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        byte[] out = pr.getInputStream().readAllBytes();
        if (!pr.waitFor(20, TimeUnit.SECONDS)) pr.destroyForcibly();
        return out;
    }

    // ---------- token de streaming (a tag <video> não envia cabeçalho Authorization) ----------

    private String sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public String issueToken(String id) {
        resolve(id);
        long exp = System.currentTimeMillis() / 1000 + 6 * 3600;
        return exp + "." + sign(id + "|" + exp);
    }

    public void verifyToken(String id, String token) {
        try {
            String[] parts = token.split("\\.", 2);
            long exp = Long.parseLong(parts[0]);
            if (exp < System.currentTimeMillis() / 1000 || !MessageDigest.isEqual(sign(id + "|" + exp).getBytes(StandardCharsets.UTF_8),
                parts[1].getBytes(StandardCharsets.UTF_8))) throw new IllegalArgumentException();
        } catch (Exception e) {
            throw new ApiException(HttpStatus.FORBIDDEN, "BAD_TOKEN", "Token de reprodução inválido ou expirado");
        }
    }
}
