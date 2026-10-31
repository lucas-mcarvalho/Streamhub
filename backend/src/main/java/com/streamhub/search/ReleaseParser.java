package com.streamhub.search;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

final class ReleaseParser {
    private ReleaseParser() {}

    private static boolean has(String t, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(t).find();
    }

    static String resolution(String t) {
        if (has(t, "2160p|\\b4k\\b|\\buhd\\b")) return "4K";
        if (has(t, "1080[pi]")) return "1080p";
        if (has(t, "720p")) return "720p";
        if (has(t, "480p|\\bsd\\b|dvdrip")) return "480p";
        return "?";
    }

    static String source(String t) {
        if (has(t, "remux")) return "REMUX";
        if (has(t, "blu-?ray|bdrip|brrip")) return "BluRay";
        if (has(t, "web-?dl")) return "WEB-DL";
        if (has(t, "webrip")) return "WEBRip";
        if (has(t, "hdtv")) return "HDTV";
        return null;
    }

    static String codec(String t) {
        if (has(t, "av1")) return "AV1";
        if (has(t, "x265|hevc|h\\.?265")) return "HEVC";
        if (has(t, "x264|avc|h\\.?264")) return "H.264";
        return null;
    }

    static List<String> audio(String t) {
        List<String> out = new ArrayList<>();
        if (has(t, "dual|dublado|dubbed|pt-?br(?!.?(sub|leg))|portuguese(?!.?sub)|\\bnacional\\b")) out.add("Português");
        if (has(t, "multi(?!.?sub)")) out.add("Multi");
        if (has(t, "\\beng(lish)?\\b")) out.add("Inglês");
        if (has(t, "\\bjap(anese)?\\b|\\bjpn\\b")) out.add("Japonês");
        return out;
    }

    static final String SUB_PT_BR = "Legenda PT-BR";
    static final String SUB_MULTI = "Multi-legendas (pode incluir PT-BR)";

    static List<String> subs(String t) {
        List<String> out = new ArrayList<>();
        if (has(t, "legendado|\\bleg\\b|pt-?br.?(sub|leg)|(sub|leg)s?.?pt-?br|portuguese.?sub")) out.add(SUB_PT_BR);
        else if (has(t, "multi.?subs?")) out.add(SUB_MULTI);
        else if (has(t, "\\bsubs?\\b")) out.add("Legendas (idioma não informado)");
        if (has(t, "vostfr")) out.add("Francês");
        return out;
    }

    /** Temporada inicial, final (pacotes S01-S04) e episódio, quando o nome os indica; nulos se não houver. */
    record SeasonInfo(Integer season, Integer seasonEnd, Integer episode) {}

    private static final Pattern RANGE = Pattern.compile("\\bS(\\d{1,2})\\s?[-~–]\\s?S?(\\d{1,2})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SXXEYY = Pattern.compile("\\bS(\\d{1,2})(?:\\s?E(\\d{1,4}))?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern WORDS = Pattern.compile(
        "(?:\\bseason[ ._-]?(\\d{1,2})\\b|\\b(\\d{1,2})(?:st|nd|rd|th)[ ._-]season\\b|\\btemporada[ ._-]?(\\d{1,2})\\b|\\b(\\d{1,2})[ªa]?[ ._-]temporada\\b)",
        Pattern.CASE_INSENSITIVE);

    static SeasonInfo season(String t) {
        var r = RANGE.matcher(t);
        if (r.find()) return new SeasonInfo(Integer.valueOf(r.group(1)), Integer.valueOf(r.group(2)), null);
        var m = SXXEYY.matcher(t);
        if (m.find()) {
            Integer ep = m.group(2) == null ? null : Integer.valueOf(m.group(2));
            return new SeasonInfo(Integer.valueOf(m.group(1)), null, ep);
        }
        var w = WORDS.matcher(t);
        if (w.find()) {
            for (int i = 1; i <= 4; i++) if (w.group(i) != null) return new SeasonInfo(Integer.valueOf(w.group(i)), null, null);
        }
        return new SeasonInfo(null, null, null);
    }
}
