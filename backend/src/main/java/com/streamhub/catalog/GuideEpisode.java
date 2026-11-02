package com.streamhub.catalog;

/** Episódio do guia de uma série: `absolute` é a numeração contínua (usada por animes: "- 009"). */
public record GuideEpisode(int season, int number, int absolute, String name, String overview, String stillUrl, Integer runtime) {}
