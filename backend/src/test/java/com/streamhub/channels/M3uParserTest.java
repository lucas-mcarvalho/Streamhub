package com.streamhub.channels;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

class M3uParserTest {
    @Test
    void parsesChannels() {
        String m3u = """
            #EXTM3U
            #EXTINF:-1 tvg-id="a.br" tvg-logo="http://x/logo.png" group-title="Kids;General",Canal A (720p)
            #EXTVLCOPT:http-user-agent=Foo
            https://exemplo.com/a/index.m3u8
            #EXTINF:-1 group-title="",Sem Grupo
            http://exemplo.com/b.ts
            #EXTINF:-1,Sem URL
            """;
        List<M3uParser.Entry> e = M3uParser.parse(m3u);
        assertEquals(2, e.size());
        assertEquals("Canal A (720p)", e.get(0).name());
        assertEquals("http://x/logo.png", e.get(0).logo());
        assertEquals("Kids;General", e.get(0).group());
        assertEquals("https://exemplo.com/a/index.m3u8", e.get(0).url());
        assertEquals("Outros", e.get(1).group());
        assertEquals("http://exemplo.com/b.ts", e.get(1).url());
    }

    @Test
    void convertsXtreamLiveTsToHls() {
        assertEquals("http://painel.tv:80/user/pass/8660.m3u8", M3uParser.toHls("http://painel.tv:80/user/pass/8660.ts"));
        assertEquals("http://painel.tv/live/user/pass/12.m3u8", M3uParser.toHls("http://painel.tv/live/user/pass/12.ts"));
        assertEquals("http://painel.tv/user/pass/12.m3u8", M3uParser.toHls("http://painel.tv/user/pass/12"));
        assertEquals("http://painel.tv/movie/user/pass/12.mp4", M3uParser.toHls("http://painel.tv/movie/user/pass/12.mp4"));
        assertEquals("http://cdn.tv/a/b/segment.ts", M3uParser.toHls("http://cdn.tv/a/b/segment.ts"));
    }
}
