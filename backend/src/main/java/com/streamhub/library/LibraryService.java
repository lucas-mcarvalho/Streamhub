package com.streamhub.library;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
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
import java.util.concurrent.atomic.AtomicLong;
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
    /** Numeração absoluta de anime: "Black Clover - 009.mkv", "Show - 12v2 [1080p].mkv". */
    private static final Pattern ABSOLUTE = Pattern.compile("\\s-\\s(\\d{1,4})(?:v\\d)?(?=[\\s.\\[(]|$)");
    private static final Pattern SXXEYY = Pattern.compile("[Ss](\\d{1,2})[Ee](\\d{1,4})|(\\d{1,2})x(\\d{2,4})");

    public record Track(String type, String codec, String language, String title) {}

    public record AudioTrack(int index, String codec, String language, String title, int channels) {}

    public record SubTrack(int index, String codec, String language, String title, boolean textBased) {}

    /** Trecho que o player oferece pular: {@code intro}, {@code recap}, {@code credits} ou {@code preview}. */
    public record SkipSegment(String kind, double start, double end) {}

    public record MediaInfo(double duration, String videoCodec, String pixFmt, boolean directPlay,
                            List<AudioTrack> audio, List<SubTrack> subtitles, List<SkipSegment> skips, int fonts) {}

    record Chapter(String title, double start, double end) {}

    private static final String OPENING = "op ?\\d*|opening.*|abertura.*";
    private static final Pattern CH_INTRO = Pattern.compile(OPENING + "|intro|introduction|introdu[cç][aã]o|title sequence|main titles?");
    private static final Pattern CH_RECAP = Pattern.compile("recap.*|previously.*|resumo.*|anteriormente.*");
    private static final Pattern CH_CREDITS = Pattern.compile("ed ?\\d*|ending.*|encerramento.*|credits|end credits|closing credits|cr[eé]ditos.*|outro");
    private static final Pattern CH_PREVIEW = Pattern.compile("preview.*|next episode.*|next time.*|yokoku|pr[eé]via.*|pr[oó]ximo epis[oó]dio.*");

    /**
     * Encontra nos capítulos do arquivo a abertura, a recapitulação, o encerramento e a prévia do próximo episódio.
     * Um capítulo "Intro" só vale como abertura quando não há outro chamado "Opening" (senão é a cena antes da abertura).
     */
    static List<SkipSegment> skipsFromChapters(List<Chapter> chapters) {
        List<SkipSegment> out = new ArrayList<>();
        boolean hasOpening = chapters.stream().anyMatch(c -> norm(c.title()).matches(OPENING));
        for (Chapter c : chapters) {
            String t = norm(c.title());
            double len = c.end() - c.start();
            if (t.isEmpty() || len < 5) continue;
            String kind = null;
            if (CH_INTRO.matcher(t).matches() && !(hasOpening && t.startsWith("intro"))) kind = len <= 300 ? "intro" : null;
            else if (CH_RECAP.matcher(t).matches()) kind = len <= 300 ? "recap" : null;
            else if (CH_CREDITS.matcher(t).matches()) kind = len <= 600 ? "credits" : null;
            else if (CH_PREVIEW.matcher(t).matches()) kind = len <= 180 ? "preview" : null;
            if (kind != null && out.stream().noneMatch(s -> s.start() == c.start())) out.add(new SkipSegment(kind, c.start(), c.end()));
        }
        return out;
    }

    private static String norm(String title) {
        return title == null ? "" : title.toLowerCase(java.util.Locale.ROOT).replaceAll("[\\p{Punct}_]+", " ").replaceAll("\\s+", " ").trim();
    }

    private static final Set<String> TEXT_SUBS = Set.of("subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text");
    private final java.util.Map<String, MediaInfo> infoCache = new java.util.concurrent.ConcurrentHashMap<>();

    private final StorageLocationRepository locations;
    private final StorageService storage;
    private final String secret;
    private final VideoAccel accel;

    public LibraryService(StorageLocationRepository locations, StorageService storage, @Value("${streamhub.secret}") String secret,
                          VideoAccel accel) {
        this.locations = locations;
        this.storage = storage;
        this.secret = secret;
        this.accel = accel;
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
        for (StorageLocation loc : storage.all()) {
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
                    } else {
                        Matcher a = ABSOLUTE.matcher(fileName);
                        while (a.find()) {   // vale o último "- NNN" do nome; ignora anos
                            int n = Integer.parseInt(a.group(1));
                            if (n > 0 && !(n >= 1900 && n <= 2099)) ep = n;
                        }
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
            .thenComparing(f -> f.season() == null ? 0 : f.season())
            .thenComparing(f -> f.episode() == null ? Integer.MAX_VALUE : f.episode())
            .thenComparing(LibraryFile::name, LibraryService::naturalCompare));
        return out;
    }

    /** Ordem natural: "Ep 2" antes de "Ep 10". */
    static int naturalCompare(String a, String b) {
        int i = 0, j = 0;
        while (i < a.length() && j < b.length()) {
            char x = a.charAt(i), y = b.charAt(j);
            if (Character.isDigit(x) && Character.isDigit(y)) {
                int si = i, sj = j;
                while (i < a.length() && Character.isDigit(a.charAt(i))) i++;
                while (j < b.length() && Character.isDigit(b.charAt(j))) j++;
                int c = new java.math.BigInteger(a.substring(si, i)).compareTo(new java.math.BigInteger(b.substring(sj, j)));
                if (c != 0) return c;
            } else {
                int c = Character.compare(Character.toLowerCase(x), Character.toLowerCase(y));
                if (c != 0) return c;
                i++; j++;
            }
        }
        return Integer.compare(a.length() - i, b.length() - j);
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
                "stream=codec_type,codec_name,pix_fmt,channels:stream_tags=language,title,mimetype,filename:format=duration"
                    + ":chapter=start_time,end_time:chapter_tags=title",
                "-of", "compact=p=0", p.toString());
            double duration = 0;
            String vcodec = null, pix = null;
            List<AudioTrack> audio = new ArrayList<>();
            List<SubTrack> subs = new ArrayList<>();
            List<Chapter> chapters = new ArrayList<>();
            int fonts = 0;
            for (String line : output.split("\n")) {
                java.util.Map<String, String> kv = new java.util.HashMap<>();
                for (String part : line.trim().split("\\|")) {
                    String[] a = part.split("=", 2);
                    if (a.length == 2) kv.put(a[0], a[1]);
                }
                String type = kv.get("codec_type");
                if (type == null && kv.containsKey("start_time") && kv.containsKey("end_time")) {
                    try {
                        chapters.add(new Chapter(kv.get("tag:title"), Double.parseDouble(kv.get("start_time")), Double.parseDouble(kv.get("end_time"))));
                    } catch (NumberFormatException ignored) { }
                } else if (type == null && kv.containsKey("duration")) {
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
                } else if ("attachment".equals(type) && isFont(kv.get("tag:mimetype"), kv.get("tag:filename"))) {
                    fonts++;
                }
            }
            String ext = ext(p);
            boolean directPlay = Set.of("mp4", "m4v", "webm", "mkv").contains(ext)
                && vcodec != null && Set.of("h264", "vp8", "vp9", "av1").contains(vcodec)
                && "yuv420p".equals(pix)
                && (audio.isEmpty() || Set.of("aac", "mp3", "opus", "vorbis", "flac").contains(audio.get(0).codec()));
            MediaInfo info = new MediaInfo(duration, vcodec, pix, directPlay, audio, subs, skipsFromChapters(chapters), fonts);
            infoCache.put(key, info);
            return info;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFPROBE", "ffprobe não está disponível ou falhou");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Conversão em andamento; {@code paced}: o vídeo está sendo recodificado e deve seguir em ritmo limitado. */
    public record Transcode(Process process, boolean paced) {}

    /** Segundos de vídeo entregues sem limite ao abrir ou pular, e depois o ritmo máximo em relação ao tempo real. */
    // PACE acima de 2: assistindo em 2x, um ritmo menor esvaziava o buffer e o vídeo travava
    private static final double BURST_SECONDS = 30, PACE = 2.5;

    /**
     * Inicia o ffmpeg gerando MP4 fragmentado (vídeo copiado quando possível, áudio em AAC estéreo).
     * Ao converter o vídeo, usa a GPU quando houver.
     */
    public Transcode startTranscode(String id, double start, int audioIndex) {
        Path p = resolve(id);
        MediaInfo info = info(id);
        boolean copyVideo = "h264".equals(info.videoCodec()) && "yuv420p".equals(info.pixFmt());
        VideoAccel.Plan plan = copyVideo ? null : accel.plan(p, info);
        List<String> cmd = new ArrayList<>(List.of("ffmpeg", "-v", "error", "-nostdin"));
        if (plan != null) cmd.addAll(List.of("-progress", "pipe:2", "-nostats"));
        if (plan != null) cmd.addAll(plan.input());
        if (start > 0) cmd.addAll(List.of("-ss", String.valueOf(start)));
        cmd.addAll(List.of("-i", p.toString(), "-map", "0:v:0"));
        if (!info.audio().isEmpty()) cmd.addAll(List.of("-map", "0:a:" + Math.max(0, Math.min(audioIndex, info.audio().size() - 1))));
        cmd.addAll(plan == null ? List.of("-c:v", "copy") : plan.video());
        cmd.addAll(List.of("-c:a", "aac", "-b:a", "192k", "-ac", "2", "-sn",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"));
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            if (plan == null) pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            return new Transcode(pb.start(), plan != null);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "NO_FFMPEG", "ffmpeg não está disponível no servidor");
        }
    }

    /**
     * Repassa o MP4 ao navegador. Ao recodificar, depois dos primeiros segundos segue só um pouco à frente do tempo real:
     * enquanto a saída não é lida, o ffmpeg fica parado esperando, sem gastar processador.
     */
    public void pipe(Transcode t, OutputStream out) throws IOException {
        Process pr = t.process();
        AtomicLong encodedMicros = new AtomicLong();
        if (t.paced()) Thread.ofVirtual().start(() -> readProgress(pr.getErrorStream(), encodedMicros));
        long started = System.nanoTime();
        byte[] buf = new byte[64 * 1024];
        try (InputStream in = pr.getInputStream()) {
            for (int n; (n = in.read(buf)) >= 0; ) {
                out.write(buf, 0, n);
                if (!t.paced()) continue;
                double ahead;
                while ((ahead = encodedMicros.get() / 1e6 - (BURST_SECONDS + PACE * (System.nanoTime() - started) / 1e9)) > 0) {
                    out.flush();
                    Thread.sleep(Math.min(1000, (long) (ahead * 1000 / PACE) + 1));
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            pr.destroyForcibly();
        }
    }

    /** Lê o "-progress" do ffmpeg (linhas "out_time_us=..."), que diz até onde o vídeo já foi convertido. */
    private static void readProgress(InputStream err, AtomicLong encodedMicros) {
        try (var r = new BufferedReader(new InputStreamReader(err, StandardCharsets.UTF_8))) {
            for (String line; (line = r.readLine()) != null; ) {
                if (!line.startsWith("out_time_us=")) continue;
                try { encodedMicros.set(Long.parseLong(line.substring(12).trim())); } catch (NumberFormatException ignored) { }
            }
        } catch (IOException ignored) {
            // o processo terminou
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

    /** Anexo do MKV que é uma fonte (fansubs embutem as fontes usadas nas legendas .ass). */
    static boolean isFont(String mimetype, String filename) {
        String m = mimetype == null ? "" : mimetype.toLowerCase();
        String f = filename == null ? "" : filename.toLowerCase();
        return m.contains("font") || m.contains("truetype") || m.contains("opentype")
            || f.endsWith(".ttf") || f.endsWith(".otf") || f.endsWith(".ttc") || f.endsWith(".woff") || f.endsWith(".woff2");
    }

    /** Legenda .ass/.ssa original, com estilos e posições, para o player desenhar como nos serviços de anime. */
    public String subtitleAss(String id, int index) {
        Path p = resolve(id);
        MediaInfo info = info(id);
        if (index < 0 || index >= info.subtitles().size()) throw new ApiException(HttpStatus.NOT_FOUND, "NO_SUB", "Legenda não encontrada");
        String codec = info.subtitles().get(index).codec();
        if (!"ass".equals(codec) && !"ssa".equals(codec)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NOT_ASS", "A legenda não está no formato ASS");
        }
        try {
            return run(90, "ffmpeg", "-v", "error", "-nostdin", "-i", p.toString(), "-map", "0:s:" + index, "-c:s", "copy", "-f", "ass", "pipe:1");
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SUB_FAILED", "Não foi possível extrair a legenda");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Extrai a n-ésima fonte anexada ao arquivo (guardada em cache no diretório temporário). */
    public Path font(String id, int n) {
        Path p = resolve(id);
        if (n < 0 || n >= info(id).fonts()) throw new ApiException(HttpStatus.NOT_FOUND, "NO_FONT", "Fonte não encontrada");
        try {
            List<Integer> idx = new ArrayList<>();
            String out = run(30, "ffprobe", "-v", "error", "-select_streams", "t", "-show_entries", "stream=index:stream_tags=mimetype,filename",
                "-of", "compact=p=0", p.toString());
            for (String line : out.split("\n")) {
                java.util.Map<String, String> kv = new java.util.HashMap<>();
                for (String part : line.trim().split("\\|")) {
                    String[] a = part.split("=", 2);
                    if (a.length == 2) kv.put(a[0], a[1]);
                }
                if (kv.containsKey("index") && isFont(kv.get("tag:mimetype"), kv.get("tag:filename"))) idx.add(Integer.parseInt(kv.get("index")));
            }
            if (n >= idx.size()) throw new ApiException(HttpStatus.NOT_FOUND, "NO_FONT", "Fonte não encontrada");
            byte[] h = MessageDigest.getInstance("SHA-256").digest((p + "|" + p.toFile().lastModified() + "|" + idx.get(n)).getBytes(StandardCharsets.UTF_8));
            Path dir = Path.of(System.getProperty("java.io.tmpdir"), "streamhub-fonts");
            Files.createDirectories(dir);
            Path target = dir.resolve(java.util.HexFormat.of().formatHex(h, 0, 16));
            if (!Files.exists(target)) {
                Path part = Files.createTempFile(dir, "font", ".part");
                Files.delete(part); // o ffmpeg recusa sobrescrever sem -y; deixa o nome livre
                // -dump_attachment grava o anexo; sem saída, o ffmpeg termina com erro depois de gravar, o que é esperado
                run(60, "ffmpeg", "-v", "error", "-nostdin", "-y", "-dump_attachment:" + idx.get(n), part.toString(), "-i", p.toString());
                if (!Files.exists(part) || Files.size(part) == 0) throw new IOException("anexo vazio");
                Files.move(part, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            }
            return target;
        } catch (IOException | NumberFormatException | java.security.NoSuchAlgorithmException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "FONT_FAILED", "Não foi possível extrair a fonte");
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

    // ---------- grade de miniaturas para a prévia ao passar o mouse na barra de tempo ----------

    /** Imagem com um quadro a cada {@code interval} segundos, em {@code cols} colunas de {@code tileW}×{@code tileH}. */
    public record Storyboard(Path image, double interval, int cols, int count, int tileW, int tileH) {}

    private static final int SB_COLS = 10, SB_TILE_W = 200, SB_MAX_TILES = 300;
    private final java.util.concurrent.ConcurrentHashMap<Path, Object> storyboardLocks = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.Semaphore storyboardSlots = new java.util.concurrent.Semaphore(2);

    /** Um quadro a cada 5 s, espaçando mais em vídeos longos para a imagem não passar de {@value #SB_MAX_TILES} quadros. */
    static double storyboardInterval(double duration) { return Math.max(5, Math.ceil(duration / SB_MAX_TILES)); }

    /**
     * Gera (uma vez por arquivo, em cache no diretório temporário) a grade de miniaturas do vídeo.
     * Decodifica só os quadros-chave, o que é rápido mesmo em HEVC 10 bits; a precisão fica no espaçamento entre eles.
     */
    public Storyboard storyboard(String id) {
        Path p = resolve(id);
        double duration = info(id).duration();
        if (!(duration > 0)) throw new ApiException(HttpStatus.NOT_FOUND, "NO_STORYBOARD", "Duração do vídeo desconhecida");
        double interval = storyboardInterval(duration);
        int count = (int) Math.ceil(duration / interval);
        int rows = (count + 1 + SB_COLS - 1) / SB_COLS; // +1: o filtro fps às vezes solta um quadro a mais no fim
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest((p + "|" + p.toFile().lastModified() + "|" + Files.size(p)
                + "|" + interval + "|" + SB_COLS + "x" + rows + "|" + SB_TILE_W).getBytes(StandardCharsets.UTF_8));
            Path dir = Path.of(System.getProperty("java.io.tmpdir"), "streamhub-storyboards");
            Files.createDirectories(dir);
            Path target = dir.resolve(java.util.HexFormat.of().formatHex(h, 0, 16) + ".jpg");
            if (!Files.exists(target)) {
                synchronized (storyboardLocks.computeIfAbsent(target, k -> new Object())) {
                    if (!Files.exists(target)) {
                        storyboardSlots.acquire();
                        try {
                            Path part = dir.resolve(target.getFileName() + ".part.jpg");
                            run(600, "ffmpeg", "-v", "error", "-nostdin", "-y", "-skip_frame", "nokey", "-i", p.toString(),
                                "-an", "-sn", "-dn", "-vf", "fps=1/" + (long) interval + ",scale=" + SB_TILE_W + ":-2,tile=" + SB_COLS + "x" + rows,
                                "-frames:v", "1", "-q:v", "5", part.toString());
                            if (!Files.exists(part) || Files.size(part) == 0) throw new IOException("grade vazia");
                            Files.move(part, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
                        } finally {
                            storyboardSlots.release();
                            storyboardLocks.remove(target);
                        }
                    }
                }
            }
            int[] size = imageSize(target);
            return new Storyboard(target, interval, SB_COLS, count, size[0] / SB_COLS, size[1] / rows);
        } catch (IOException | java.security.NoSuchAlgorithmException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORYBOARD_FAILED", "Não foi possível gerar as miniaturas");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERRUPTED", "Interrompido");
        }
    }

    /** Largura e altura de uma imagem lendo só o cabeçalho. */
    private static int[] imageSize(Path img) throws IOException {
        try (javax.imageio.stream.ImageInputStream in = javax.imageio.ImageIO.createImageInputStream(img.toFile())) {
            java.util.Iterator<javax.imageio.ImageReader> readers = javax.imageio.ImageIO.getImageReaders(in);
            if (!readers.hasNext()) throw new IOException("formato desconhecido");
            javax.imageio.ImageReader r = readers.next();
            try {
                r.setInput(in);
                return new int[] { r.getWidth(0), r.getHeight(0) };
            } finally {
                r.dispose();
            }
        }
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
