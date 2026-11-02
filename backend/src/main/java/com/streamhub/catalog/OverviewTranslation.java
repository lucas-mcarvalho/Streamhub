package com.streamhub.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "overview_translation")
@Getter
@Setter
public class OverviewTranslation {
    @Id
    @Column(name = "item_ref")
    private String itemRef;
    @Column(columnDefinition = "text")
    private String text;
    private String source;
}
