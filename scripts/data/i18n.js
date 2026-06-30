'use strict';
// This file contains a bunch of strings as global variables, so that we can use it to localise code that deals with DOM
// manipulation

// Global object to store our localisation data
var lc = {};

// deck.js
lc.import_deck_confirm_text = "{{ _ import_deck_confirm_text }}";
lc.clear_deck_confirm_text = "{{ _ clear_deck_confirm_text }}";
// account.js
lc.clear_account_confirm_text = "{{ _ clear_account_confirm_text }}";
// Singular/plural pair baked from one ui18n switch pattern; daily-streak.js picks a variant at
// runtime and substitutes the literal {streak} placeholder with the live count
lc.streak_days_count = "{{ _ streak_days_count {{ dict streak_days 2 }} }}"
lc.streak_days_count_one = "{{ _ streak_days_count {{ dict streak_days 1 }} }}"

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

lc.level_reduce_label = "{{ _ level-reduce-label }}";

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
lc.finish_page_header = "{{ _ finish_page_header }}"
lc.finish_page_characters_reviewed = "{{ _ finish_page_characters_reviewed }}"
lc.finish_page_phrases_reviewed = "{{ _ finish_page_phrases_reviewed }}"
lc.finish_page_accuracy = "{{ _ finish_page_accuracy }}"
lc.finish_page_session_len = "{{ _ finish_page_session_len }}"
// The day/days wording is a ui18n switch pattern on the streak_days variable, resolved at build
// time — so the plural and singular variants are baked separately and the code picks one at
// runtime. The {streak} placeholder survives the build (no variable is passed for it) and is
// substituted with the live count in main-page.js
lc.finish_page_streak_increased = "{{ _ finish_page_streak_increased {{ dict streak_days 2 }} }}"
lc.finish_page_streak_increased_one = "{{ _ finish_page_streak_increased {{ dict streak_days 1 }} }}"
lc.finish_page_continue = "{{ _ finish_page_continue }}"

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

lc.deck_new_delete_card = "{{ _ deck-new-delete-card }}"
lc.deck_new_delete_phrase = "{{ _ deck-new-delete-phrase }}"

// marketplace.js
lc.leveled_up_no = "{{ _ leveled_up_no }}";
lc.leveled_up_yes = "{{ _ leveled_up_yes }}";
lc.pre_leveled_up = "{{ _ pre_leveled_up }}";

lc.deck_import = "{{ _ import-deck-button }}";
lc.deck_source = "{{ _ deck_source }}";
lc.deck_download = "{{ _ deck_download }}";

// The {} placeholder is filled at runtime by createErrorElement (status code)
lc.marketplace_load_error = "{{ _ marketplace_load_error }}";

lc.community_decks_header = "{{ _ community_decks_header }}";

// theme switcher (index.js)
lc.theme_button = "{{ _ theme_button }}";
lc.theme_search_placeholder = "{{ _ theme_search_placeholder }}";

// browser-support gate (browser-support.js). The nojs_* keys are HTML-only (noscript) and are not
// needed here.
lc.unsupported_title = "{{ _ unsupported_title }}";
lc.unsupported_privacy_body = "{{ _ unsupported_privacy_body }}";
lc.unsupported_outdated_body = "{{ _ unsupported_outdated_body }}";
lc.unsupported_reload = "{{ _ unsupported_reload }}";

// character database loading UI (index.js)
lc.char_loading_title = "{{ _ char_loading_title }}";
lc.char_loading_subtitle = "{{ _ char_loading_subtitle }}";
lc.char_updating_label = "{{ _ char_updating_label }}";

// deck import loading UI (marketplace.js)
lc.deck_import_title = "{{ _ deck_import_title }}";
lc.deck_import_subtitle = "{{ _ deck_import_subtitle }}";

// onboarding tutorial (tutorial.js) — keep these free of double quotes (they are injected into a
// double-quoted JS string literal); use single quotes inside the copy instead
lc.tutorial_next = "{{ _ tutorial_next }}";
lc.tutorial_done = "{{ _ tutorial_done }}";
lc.tutorial_skip = "{{ _ tutorial_skip }}";
lc.tutorial_continue = "{{ _ tutorial_continue }}";
lc.tutorial_preparing = "{{ _ tutorial_preparing }}";
lc.tutorial_finish = "{{ _ tutorial_finish }}";

lc.tutorial_intro_title = "{{ _ tutorial_intro_title }}";
lc.tutorial_intro_body = "{{ _ tutorial_intro_body }}";
lc.tutorial_outro_title = "{{ _ tutorial_outro_title }}";
lc.tutorial_outro_body = "{{ _ tutorial_outro_body }}";

lc.tutorial_marketplace_title = "{{ _ tutorial_marketplace_title }}";
lc.tutorial_marketplace_intro = "{{ _ tutorial_marketplace_intro }}";
lc.tutorial_marketplace_search_title = "{{ _ tutorial_marketplace_search_title }}";
lc.tutorial_marketplace_search = "{{ _ tutorial_marketplace_search }}";
lc.tutorial_marketplace_import_title = "{{ _ tutorial_marketplace_import_title }}";
lc.tutorial_marketplace_import = "{{ _ tutorial_marketplace_import }}";
lc.tutorial_marketplace_import_replay = "{{ _ tutorial_marketplace_import_replay }}";
lc.tutorial_marketplace_unavailable = "{{ _ tutorial_marketplace_unavailable }}";

lc.tutorial_deck_title = "{{ _ tutorial_deck_title }}";
lc.tutorial_deck_intro = "{{ _ tutorial_deck_intro }}";
lc.tutorial_deck_newcard_title = "{{ _ tutorial_deck_newcard_title }}";
lc.tutorial_deck_newcard = "{{ _ tutorial_deck_newcard }}";
lc.tutorial_deck_phrases_title = "{{ _ tutorial_deck_phrases_title }}";
lc.tutorial_deck_phrases = "{{ _ tutorial_deck_phrases }}";
lc.tutorial_deck_characters_title = "{{ _ tutorial_deck_characters_title }}";
lc.tutorial_deck_characters = "{{ _ tutorial_deck_characters }}";
lc.tutorial_deck_search_title = "{{ _ tutorial_deck_search_title }}";
lc.tutorial_deck_search = "{{ _ tutorial_deck_search }}";

lc.tutorial_review_edit_title = "{{ _ tutorial_review_edit_title }}";
lc.tutorial_review_edit = "{{ _ tutorial_review_edit }}";
lc.tutorial_review_partof_title = "{{ _ tutorial_review_partof_title }}";
lc.tutorial_review_partof = "{{ _ tutorial_review_partof }}";

lc.tutorial_card_ime_title = "{{ _ tutorial_card_ime_title }}";
lc.tutorial_card_ime = "{{ _ tutorial_card_ime }}";
lc.tutorial_card_input_title = "{{ _ tutorial_card_input_title }}";
lc.tutorial_card_input = "{{ _ tutorial_card_input }}";
lc.tutorial_card_preview_title = "{{ _ tutorial_card_preview_title }}";
lc.tutorial_card_preview = "{{ _ tutorial_card_preview }}";
lc.tutorial_card_save_title = "{{ _ tutorial_card_save_title }}";
lc.tutorial_card_save = "{{ _ tutorial_card_save }}";

lc.tutorial_phrase_input_title = "{{ _ tutorial_phrase_input_title }}";
lc.tutorial_phrase_input = "{{ _ tutorial_phrase_input }}";
lc.tutorial_phrase_autocards_title = "{{ _ tutorial_phrase_autocards_title }}";
lc.tutorial_phrase_autocards = "{{ _ tutorial_phrase_autocards }}";
lc.tutorial_phrase_save_title = "{{ _ tutorial_phrase_save_title }}";
lc.tutorial_phrase_save = "{{ _ tutorial_phrase_save }}";

lc.tutorial_session_title = "{{ _ tutorial_session_title }}";
lc.tutorial_session_start = "{{ _ tutorial_session_start }}";
lc.tutorial_session_replay = "{{ _ tutorial_session_replay }}";
lc.tutorial_session_done_title = "{{ _ tutorial_session_done_title }}";
lc.tutorial_session_done = "{{ _ tutorial_session_done }}";

lc.tutorial_account_stats_title = "{{ _ tutorial_account_stats_title }}";
lc.tutorial_account_stats = "{{ _ tutorial_account_stats }}";
lc.tutorial_account_settings_title = "{{ _ tutorial_account_settings_title }}";
lc.tutorial_account_settings = "{{ _ tutorial_account_settings }}";

lc.tutorial_card_pron_title = "{{ _ tutorial_card_pron_title }}";
lc.tutorial_card_pron = "{{ _ tutorial_card_pron }}";
lc.tutorial_card_defs_title = "{{ _ tutorial_card_defs_title }}";
lc.tutorial_card_defs = "{{ _ tutorial_card_defs }}";
lc.tutorial_cardreview_title = "{{ _ tutorial_cardreview_title }}";
lc.tutorial_cardreview = "{{ _ tutorial_cardreview }}";
lc.tutorial_cardreview_phrase_title = "{{ _ tutorial_cardreview_phrase_title }}";
lc.tutorial_cardreview_phrase = "{{ _ tutorial_cardreview_phrase }}";
lc.tutorial_phrase_pron_title = "{{ _ tutorial_phrase_pron_title }}";
lc.tutorial_phrase_pron = "{{ _ tutorial_phrase_pron }}";
lc.tutorial_phrase_defs_title = "{{ _ tutorial_phrase_defs_title }}";
lc.tutorial_phrase_defs = "{{ _ tutorial_phrase_defs }}";
lc.tutorial_phrase_subcard_title = "{{ _ tutorial_phrase_subcard_title }}";
lc.tutorial_phrase_subcard = "{{ _ tutorial_phrase_subcard }}";
lc.tutorial_review_phrase_title = "{{ _ tutorial_review_phrase_title }}";
lc.tutorial_review_phrase = "{{ _ tutorial_review_phrase }}";
lc.tutorial_review_navigate_title = "{{ _ tutorial_review_navigate_title }}";
lc.tutorial_review_navigate = "{{ _ tutorial_review_navigate }}";

lc.tutorial_card_variant_title = "{{ _ tutorial_card_variant_title }}";
lc.tutorial_card_variant = "{{ _ tutorial_card_variant }}";
lc.tutorial_account_extensive_title = "{{ _ tutorial_account_extensive_title }}";
lc.tutorial_account_extensive = "{{ _ tutorial_account_extensive }}";
lc.tutorial_account_levelreduce_title = "{{ _ tutorial_account_levelreduce_title }}";
lc.tutorial_account_levelreduce = "{{ _ tutorial_account_levelreduce }}";
lc.tutorial_account_language_title = "{{ _ tutorial_account_language_title }}";
lc.tutorial_account_language = "{{ _ tutorial_account_language }}";
lc.tutorial_account_theme_title = "{{ _ tutorial_account_theme_title }}";
lc.tutorial_account_theme = "{{ _ tutorial_account_theme }}";
lc.tutorial_account_replay_title = "{{ _ tutorial_account_replay_title }}";
lc.tutorial_account_replay = "{{ _ tutorial_account_replay }}";
lc.tutorial_account_clear_title = "{{ _ tutorial_account_clear_title }}";
lc.tutorial_account_clear = "{{ _ tutorial_account_clear }}";
lc.tutorial_account_activity_title = "{{ _ tutorial_account_activity_title }}";
lc.tutorial_account_activity = "{{ _ tutorial_account_activity }}";

// activity calendar (activity-calendar.js). The {count}/{date} placeholders survive the build and
// are filled in at runtime
lc.activity_legend_less = "{{ _ activity_legend_less }}";
lc.activity_legend_more = "{{ _ activity_legend_more }}";
lc.activity_tooltip = "{{ _ activity_tooltip }}";
lc.activity_tooltip_one = "{{ _ activity_tooltip_one }}";
lc.activity_tooltip_none = "{{ _ activity_tooltip_none }}";
