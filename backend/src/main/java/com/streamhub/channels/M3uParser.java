package com.streamhub.channels;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class M3uParser {
    private M3uParser() {}

    record Entry(String name, String logo, String group, String url) {}

    private static final Pattern ATTR = Pattern.compile("([A-Za-z0-9_-]+)=\"([^\"]*)\"");

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
                if (line.startsWith("http://") || line.startsWith("https://")) {
                    out.add(new Entry(name.isBlank() ? "Canal sem nome" : name, logo, group == null || group.isBlank() ? "Outros" : group, line));
                }
                name = null;
            }
        }
        return out;
    }
}
