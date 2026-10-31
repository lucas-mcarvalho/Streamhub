package com.streamhub.channels;

/** `playUrl` aponta para o proxy do StreamHub (assinado); o endereço original não é exposto ao navegador. */
public record Channel(int id, String name, String logo, String group, boolean hls, String playUrl) {}
