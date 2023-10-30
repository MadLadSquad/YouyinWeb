'use strict';
// This file contains a bunch of strings as global variables, so that we can use it to localise code that deals with DOM
// manipulation

// Global object to store our localisation data
var lc = {};

// deck.js
lc.import_deck_confirm_text = "{{ _ import_deck_confirm_text }}";
lc.clear_deck_confirm_text = "{{ _ clear_deck_confirm_text }}";
lc.streak_field_days = "{{ _ streak_field_days }}"

lc.hours = "{{ _ hours }}";
lc.milliseconds = "{{ _ milliseconds }}";
lc.minutes = "{{ _ minutes }}";
lc.seconds = "{{ _ seconds }}";

lc.locale = "{{ _ js_locale }}";

lc.no_sessions_recorded = "{{ _ no_sessions_recorded }}";
lc.average_knowledge_level = "{{ _ average_knowledge_level }}";

lc.part_of = "{{ _ part_of }}";
lc.deck_definitions = "{{ _ character-info-widget-def-p }}";
lc.deck_card_edit = "{{ _ deck_card_edit }}";

// deck-new.js
lc.unknown_character = "{{ _ unknown_character }}";
lc.unknown_phrase = "{{ _ unknown_phrase }}";

lc.character_variant_default = "{{ _ character_variant_default }}";
lc.character_variant_kanji = "{{ _ character_variant_kanji }}";
lc.character_variant_hanja = "{{ _ character_variant_hanja }}";

lc.name_text_field_aria = "{{ _ name_text_field_aria }}";
lc.character_text_field_aria = "{{ _ character_text_field_aria }}";
lc.meaning_text_field_aria = "{{ _ meaning_text_field_aria }}";
lc.character_variant_box_aria = "{{ _ character_variant_box_aria }}";

lc.card_name = "{{ _ card_name }}";
lc.card_phrase = "{{ _ card_phrase }}";
lc.card_character = "{{ _ card_character }}";

// main-page.js
lc.phrases_count_phrase = "{{ _ deck-phrases-header }}";
lc.phrases_count_errors = "{{ _ phrases_count_errors }}";
lc.phrases_count_cards = "{{ _ phrases_count_cards }}";
lc.phrases_count_spelling = "{{ _ phrases_count_spelling }}";

lc.to_be_loaded = "{{ _ to_be_loaded }}";

lc.start_button_text = "{{ _ start-button }}";

// FIXME: This should be handled in the template
lc.no_cards_link_deck = "{{ _ no_cards_link_deck }}";
lc.no_cards_text = "{{ _ no_cards_text }}";
lc.no_cards_text_postfix = "{{ _ no_cards_text_postfix }}";

// marketplace.js
lc.leveled_up_no = "{{ _ leveled_up_no }}";
lc.leveled_up_yes = "{{ _ leveled_up_yes }}";
lc.status = "{{ _ status }}";
lc.pre_leveled_up = "{{ _ pre_leveled_up }}";

lc.deck_import = "{{ _ import-deck-button }}";
lc.deck_source = "{{ _ deck_source }}";
lc.deck_download = "{{ _ deck_download }}";

// TODO: Add translation for the error element

lc.official = "{{ _ official }}";
lc.community = "{{ _ community }}";
lc.release = "{{ _ release }}";
