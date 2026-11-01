package com.streamhub.channels;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class M3uParser {
    private M3uParser() {}

    record Entry(String name, String logo, String group, String url) {}

    private static final Pattern ATTR = Pattern.compile("([A-Za-z0-9_-]+)=\"([^\"]*)\"");

    /** Canal ao vivo de painel Xtream: /usuario/senha/123[.ts] ou /live/usuario/senha/123[.ts]. */
    private static final Pattern XTREAM_TS = Pattern.compile("^(https?://[^/?#]+/(?:live/)?[^/?#]+/[^/?#]+/\\d+)(?:\\.ts)?$");

    static List<Entry> parse(String text) {
        List<Entry> out = new ArrayList<>();
        String name = null, logo = null, group = null;
        for (String raw : text.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.startsWith("#EXTINF")) {
                logo = null;
                group = null;
                Matcher m = ATTR.matcher(line);
                while (m.find()) {
                    if (m.group(1).equalsIgnoreCase("tvg-logo")) logo = m.group(2);
                    else if (m.group(1).equalsIgnoreCase("group-title")) group = m.group(2);
                }
                int comma = line.lastIndexOf(',');
                name = comma >= 0 ? line.substring(comma + 1).trim() : null;
            } else if (!line.isEmpty() && !line.startsWith("#") && name != null) {
                boolean adult = group != null && group.toLowerCase().contains("xxx");
                if (!adult && (line.startsWith("http://") || line.startsWith("https://"))) {
                    out.add(new Entry(name.isBlank() ? "Canal sem nome" : name, logo, group == null || group.isBlank() ? "Outros" : group, toHls(line)));
                }
                name = null;
            }
        }
        return out;
    }

    /** O player só toca HLS; esses painéis servem o mesmo canal como .m3u8. */
    static String toHls(String url) {
        Matcher m = XTREAM_TS.matcher(url);
        return m.matches() ? m.group(1) + ".m3u8" : url;
    }
}
