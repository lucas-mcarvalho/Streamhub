package com.streamhub.download;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import org.junit.jupiter.api.Test;

class TorrentHashTest {
    @Test
    void hashOfInfoDictionaryIsSha1OfItsRawBytes() throws Exception {
        String info = "d6:lengthi5e4:name1:xe";
        byte[] torrent = ("d8:announce3:abc4:info" + info + "5:other" + "l1:ai2eee").getBytes(StandardCharsets.ISO_8859_1);
        String expected = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(info.getBytes(StandardCharsets.ISO_8859_1)));
        assertEquals(expected, TorrentHash.fromTorrent(torrent));
    }

    @Test
    void magnetHashIsLowercasedAndBase32IsConverted() {
        assertEquals("8ce0ee1a47e40d11f6ed4afaf00041f4b377fb53",
            TorrentHash.fromMagnet("magnet:?xt=urn:btih:8CE0EE1A47E40D11F6ED4AFAF00041F4B377FB53&dn=x"));
        assertNull(TorrentHash.fromMagnet("magnet:?dn=sem-hash"));
    }
}
