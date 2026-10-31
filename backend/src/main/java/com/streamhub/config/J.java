package com.streamhub.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Utilitários para navegar em JSON desserializado como Map/List. */
public final class J {
    private J() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object o) {
        return o instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    public static List<Map<String, Object>> maps(Object o) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (o instanceof List<?> l) for (Object e : l) if (e instanceof Map<?, ?>) out.add(map(e));
        return out;
    }

    public static List<Object> list(Object o) {
        return o instanceof List<?> l ? new ArrayList<>(l) : List.of();
    }

    public static Object at(Object root, String... keys) {
        Object cur = root;
        for (String k : keys) {
            if (!(cur instanceof Map<?, ?> m)) return null;
            cur = m.get(k);
        }
        return cur;
    }

    public static String str(Object o) { return o == null ? null : o.toString(); }

    public static Double dbl(Object o) { return o instanceof Number n ? n.doubleValue() : null; }

    public static Long lng(Object o) { return o instanceof Number n ? n.longValue() : null; }

    public static Integer integer(Object o) { return o instanceof Number n ? n.intValue() : null; }
}
