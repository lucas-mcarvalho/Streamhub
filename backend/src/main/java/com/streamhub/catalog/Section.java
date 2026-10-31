package com.streamhub.catalog;

import java.util.List;

/** Seção de resultados; se o provedor falhar, `error` explica o motivo e `items` fica vazio. */
public record Section(String key, String title, List<CatalogItem> items, String error) {}
