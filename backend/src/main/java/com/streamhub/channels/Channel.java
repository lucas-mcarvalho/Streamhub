package com.streamhub.channels;

/** `playUrl` aponta para o proxy do StreamHub (assinado); o endereço original não é exposto ao navegador.
 * `direct`: vídeo (MP4/WebM) que a tag de vídeo toca sem hls.js. */
public record Channel(int id, String name, String logo, String group, java.util.List<String> genres, boolean hls, boolean direct, String playUrl) {}
