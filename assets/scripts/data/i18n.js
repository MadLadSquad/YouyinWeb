'use strict';
// This file contains a bunch of strings as global variables, so that we can use it to localise code that deals with DOM
// manipulation

// Global object to store our localisation data
var lc = {};

// deck.js
lc.import_deck_confirm_text = {{ partial "t.html" (dict "k" "import_deck_confirm_text" "loc" $.loc) | jsonify }};
lc.clear_deck_confirm_text = {{ partial "t.html" (dict "k" "clear_deck_confirm_text" "loc" $.loc) | jsonify }};
// account.js
lc.clear_account_confirm_text = {{ partial "t.html" (dict "k" "clear_account_confirm_text" "loc" $.loc) | jsonify }};
// Singular/plural pair baked from one ui18n switch pattern; daily-streak.js picks a variant at
// runtime and substitutes the literal {streak} placeholder with the live count
lc.streak_days_count = {{ partial "t.html" (dict "k" "streak_days_count" "loc" $.loc) | jsonify }}
lc.streak_days_count_one = {{ partial "t.html" (dict "k" "streak_days_count_one" "loc" $.loc) | jsonify }}

lc.hours = {{ partial "t.html" (dict "k" "hours" "loc" $.loc) | jsonify }};
lc.milliseconds = {{ partial "t.html" (dict "k" "milliseconds" "loc" $.loc) | jsonify }};
lc.minutes = {{ partial "t.html" (dict "k" "minutes" "loc" $.loc) | jsonify }};
lc.seconds = {{ partial "t.html" (dict "k" "seconds" "loc" $.loc) | jsonify }};

lc.locale = {{ partial "t.html" (dict "k" "js_locale" "loc" $.loc) | jsonify }};

lc.no_sessions_recorded = {{ partial "t.html" (dict "k" "no_sessions_recorded" "loc" $.loc) | jsonify }};
lc.average_knowledge_level = {{ partial "t.html" (dict "k" "average_knowledge_level" "loc" $.loc) | jsonify }};

lc.part_of = {{ partial "t.html" (dict "k" "part_of" "loc" $.loc) | jsonify }};
lc.deck_definitions = {{ partial "t.html" (dict "k" "character-info-widget-def-p" "loc" $.loc) | jsonify }};
lc.deck_card_edit = {{ partial "t.html" (dict "k" "deck_card_edit" "loc" $.loc) | jsonify }};

lc.level_reduce_label = {{ partial "t.html" (dict "k" "level-reduce-label" "loc" $.loc) | jsonify }};

// deck-new.js
lc.unknown_character = {{ partial "t.html" (dict "k" "unknown_character" "loc" $.loc) | jsonify }};
lc.unknown_phrase = {{ partial "t.html" (dict "k" "unknown_phrase" "loc" $.loc) | jsonify }};

lc.character_variant_default = {{ partial "t.html" (dict "k" "character_variant_default" "loc" $.loc) | jsonify }};
lc.character_variant_kanji = {{ partial "t.html" (dict "k" "character_variant_kanji" "loc" $.loc) | jsonify }};
lc.character_variant_hanja = {{ partial "t.html" (dict "k" "character_variant_hanja" "loc" $.loc) | jsonify }};

lc.name_text_field_aria = {{ partial "t.html" (dict "k" "name_text_field_aria" "loc" $.loc) | jsonify }};
lc.character_text_field_aria = {{ partial "t.html" (dict "k" "character_text_field_aria" "loc" $.loc) | jsonify }};
lc.meaning_text_field_aria = {{ partial "t.html" (dict "k" "meaning_text_field_aria" "loc" $.loc) | jsonify }};
lc.character_variant_box_aria = {{ partial "t.html" (dict "k" "character_variant_box_aria" "loc" $.loc) | jsonify }};

lc.card_name = {{ partial "t.html" (dict "k" "card_name" "loc" $.loc) | jsonify }};
lc.card_phrase = {{ partial "t.html" (dict "k" "card_phrase" "loc" $.loc) | jsonify }};
lc.card_character = {{ partial "t.html" (dict "k" "card_character" "loc" $.loc) | jsonify }};

// main-page.js
lc.finish_page_header = {{ partial "t.html" (dict "k" "finish_page_header" "loc" $.loc) | jsonify }}
lc.finish_page_characters_reviewed = {{ partial "t.html" (dict "k" "finish_page_characters_reviewed" "loc" $.loc) | jsonify }}
lc.finish_page_phrases_reviewed = {{ partial "t.html" (dict "k" "finish_page_phrases_reviewed" "loc" $.loc) | jsonify }}
lc.finish_page_accuracy = {{ partial "t.html" (dict "k" "finish_page_accuracy" "loc" $.loc) | jsonify }}
lc.finish_page_session_len = {{ partial "t.html" (dict "k" "finish_page_session_len" "loc" $.loc) | jsonify }}
// The day/days wording is a ui18n switch pattern on the streak_days variable, resolved at build
// time — so the plural and singular variants are baked separately and the code picks one at
// runtime. The {streak} placeholder survives the build (no variable is passed for it) and is
// substituted with the live count in main-page.js
lc.finish_page_streak_increased = {{ partial "t.html" (dict "k" "finish_page_streak_increased" "loc" $.loc) | jsonify }}
lc.finish_page_streak_increased_one = {{ partial "t.html" (dict "k" "finish_page_streak_increased_one" "loc" $.loc) | jsonify }}
lc.finish_page_continue = {{ partial "t.html" (dict "k" "finish_page_continue" "loc" $.loc) | jsonify }}

lc.phrases_count_phrase = {{ partial "t.html" (dict "k" "deck-phrases-header" "loc" $.loc) | jsonify }};
lc.phrases_count_errors = {{ partial "t.html" (dict "k" "phrases_count_errors" "loc" $.loc) | jsonify }};
lc.phrases_count_cards = {{ partial "t.html" (dict "k" "phrases_count_cards" "loc" $.loc) | jsonify }};
lc.phrases_count_spelling = {{ partial "t.html" (dict "k" "phrases_count_spelling" "loc" $.loc) | jsonify }};

lc.to_be_loaded = {{ partial "t.html" (dict "k" "to_be_loaded" "loc" $.loc) | jsonify }};

lc.start_button_text = {{ partial "t.html" (dict "k" "start-button" "loc" $.loc) | jsonify }};

// FIXME: This should be handled in the template
lc.no_cards_link_deck = {{ partial "t.html" (dict "k" "no_cards_link_deck" "loc" $.loc) | jsonify }};
lc.no_cards_text = {{ partial "t.html" (dict "k" "no_cards_text" "loc" $.loc) | jsonify }};
lc.no_cards_text_postfix = {{ partial "t.html" (dict "k" "no_cards_text_postfix" "loc" $.loc) | jsonify }};

lc.deck_new_delete_card = {{ partial "t.html" (dict "k" "deck-new-delete-card" "loc" $.loc) | jsonify }}
lc.deck_new_delete_phrase = {{ partial "t.html" (dict "k" "deck-new-delete-phrase" "loc" $.loc) | jsonify }}

// marketplace.js
lc.leveled_up_no = {{ partial "t.html" (dict "k" "leveled_up_no" "loc" $.loc) | jsonify }};
lc.leveled_up_yes = {{ partial "t.html" (dict "k" "leveled_up_yes" "loc" $.loc) | jsonify }};
lc.pre_leveled_up = {{ partial "t.html" (dict "k" "pre_leveled_up" "loc" $.loc) | jsonify }};

lc.deck_import = {{ partial "t.html" (dict "k" "import-deck-button" "loc" $.loc) | jsonify }};
lc.deck_source = {{ partial "t.html" (dict "k" "deck_source" "loc" $.loc) | jsonify }};
lc.deck_download = {{ partial "t.html" (dict "k" "deck_download" "loc" $.loc) | jsonify }};

// The {} placeholder is filled at runtime by createErrorElement (status code)
lc.marketplace_load_error = {{ partial "t.html" (dict "k" "marketplace_load_error" "loc" $.loc) | jsonify }};

lc.community_decks_header = {{ partial "t.html" (dict "k" "community_decks_header" "loc" $.loc) | jsonify }};

// theme switcher (index.js)
lc.theme_button = {{ partial "t.html" (dict "k" "theme_button" "loc" $.loc) | jsonify }};
lc.session_exit = {{ partial "t.html" (dict "k" "session_exit" "loc" $.loc) | jsonify }};
lc.session_queue_note = {{ partial "t.html" (dict "k" "session_queue_note" "loc" $.loc) | jsonify }};
lc.session_errors_count = {{ partial "t.html" (dict "k" "session_errors_count" "loc" $.loc) | jsonify }};
// The strip's label swaps between this and the two stage names (phrases_count_cards /
// phrases_count_phrase) as the round moves from cards to phrases
lc.session_round_in_progress = {{ partial "t.html" (dict "k" "session_round_in_progress" "loc" $.loc) | jsonify }};
lc.deck_knowledge_label = {{ partial "t.html" (dict "k" "deck_knowledge_label" "loc" $.loc) | jsonify }};
lc.deck_summary = {{ partial "t.html" (dict "k" "deck_summary" "loc" $.loc) | jsonify }};
lc.today_of_goal = {{ partial "t.html" (dict "k" "today_of_goal" "loc" $.loc) | jsonify }};
lc.today_no_goal = {{ partial "t.html" (dict "k" "today_no_goal" "loc" $.loc) | jsonify }};
lc.today_goal_met = {{ partial "t.html" (dict "k" "today_goal_met" "loc" $.loc) | jsonify }};
lc.today_goal_left = {{ partial "t.html" (dict "k" "today_goal_left" "loc" $.loc) | jsonify }};
lc.today_goal_left_one = {{ partial "t.html" (dict "k" "today_goal_left_one" "loc" $.loc) | jsonify }};
lc.streak_freeze_held = {{ partial "t.html" (dict "k" "streak_freeze_held" "loc" $.loc) | jsonify }};
lc.streak_freeze_held_one = {{ partial "t.html" (dict "k" "streak_freeze_held_one" "loc" $.loc) | jsonify }};

// app-bar streak/gems panel (daily-streak.js). The first five are the same labels the account page's
// profile card and shop render from HTML; the panel needs them from JS as well
lc.streak_field = {{ partial "t.html" (dict "k" "streak-field" "loc" $.loc) | jsonify }};
lc.gems_label = {{ partial "t.html" (dict "k" "gems_label" "loc" $.loc) | jsonify }};
lc.gems_panel_hint = {{ partial "t.html" (dict "k" "gems_panel_hint" "loc" $.loc) | jsonify }};
lc.streak_freeze_field = {{ partial "t.html" (dict "k" "streak-freeze-field" "loc" $.loc) | jsonify }};
lc.streak_freeze_cost_field = {{ partial "t.html" (dict "k" "streak-freeze-cost-field" "loc" $.loc) | jsonify }};
lc.buy_streak_freeze_button = {{ partial "t.html" (dict "k" "buy_streak_freeze_button" "loc" $.loc) | jsonify }};
lc.streak_panel_none = {{ partial "t.html" (dict "k" "streak_panel_none" "loc" $.loc) | jsonify }};
lc.streak_panel_safe = {{ partial "t.html" (dict "k" "streak_panel_safe" "loc" $.loc) | jsonify }};
lc.streak_panel_protected = {{ partial "t.html" (dict "k" "streak_panel_protected" "loc" $.loc) | jsonify }};
lc.streak_panel_at_risk = {{ partial "t.html" (dict "k" "streak_panel_at_risk" "loc" $.loc) | jsonify }};
lc.theme_search_placeholder = {{ partial "t.html" (dict "k" "theme_search_placeholder" "loc" $.loc) | jsonify }};

// browser-support gate (browser-support.js). The nojs_* keys are HTML-only (noscript) and are not
// needed here.
lc.unsupported_title = {{ partial "t.html" (dict "k" "unsupported_title" "loc" $.loc) | jsonify }};
lc.unsupported_privacy_body = {{ partial "t.html" (dict "k" "unsupported_privacy_body" "loc" $.loc) | jsonify }};
lc.unsupported_outdated_body = {{ partial "t.html" (dict "k" "unsupported_outdated_body" "loc" $.loc) | jsonify }};
lc.unsupported_reload = {{ partial "t.html" (dict "k" "unsupported_reload" "loc" $.loc) | jsonify }};

// character database loading UI (index.js)
lc.char_loading_title = {{ partial "t.html" (dict "k" "char_loading_title" "loc" $.loc) | jsonify }};
lc.char_loading_subtitle = {{ partial "t.html" (dict "k" "char_loading_subtitle" "loc" $.loc) | jsonify }};
lc.char_updating_label = {{ partial "t.html" (dict "k" "char_updating_label" "loc" $.loc) | jsonify }};

// deck import loading UI (marketplace.js)
lc.deck_import_title = {{ partial "t.html" (dict "k" "deck_import_title" "loc" $.loc) | jsonify }};
lc.deck_import_subtitle = {{ partial "t.html" (dict "k" "deck_import_subtitle" "loc" $.loc) | jsonify }};

// onboarding tutorial (tutorial.js) — keep these free of double quotes (they are injected into a
// double-quoted JS string literal); use single quotes inside the copy instead
lc.tutorial_next = {{ partial "t.html" (dict "k" "tutorial_next" "loc" $.loc) | jsonify }};
lc.tutorial_done = {{ partial "t.html" (dict "k" "tutorial_done" "loc" $.loc) | jsonify }};
lc.tutorial_skip = {{ partial "t.html" (dict "k" "tutorial_skip" "loc" $.loc) | jsonify }};
lc.tutorial_continue = {{ partial "t.html" (dict "k" "tutorial_continue" "loc" $.loc) | jsonify }};
lc.tutorial_preparing = {{ partial "t.html" (dict "k" "tutorial_preparing" "loc" $.loc) | jsonify }};
lc.tutorial_finish = {{ partial "t.html" (dict "k" "tutorial_finish" "loc" $.loc) | jsonify }};

lc.tutorial_intro_title = {{ partial "t.html" (dict "k" "tutorial_intro_title" "loc" $.loc) | jsonify }};
lc.tutorial_intro_body = {{ partial "t.html" (dict "k" "tutorial_intro_body" "loc" $.loc) | jsonify }};
lc.tutorial_outro_title = {{ partial "t.html" (dict "k" "tutorial_outro_title" "loc" $.loc) | jsonify }};
lc.tutorial_outro_body = {{ partial "t.html" (dict "k" "tutorial_outro_body" "loc" $.loc) | jsonify }};

lc.tutorial_marketplace_title = {{ partial "t.html" (dict "k" "tutorial_marketplace_title" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_intro = {{ partial "t.html" (dict "k" "tutorial_marketplace_intro" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_search_title = {{ partial "t.html" (dict "k" "tutorial_marketplace_search_title" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_search = {{ partial "t.html" (dict "k" "tutorial_marketplace_search" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_import_title = {{ partial "t.html" (dict "k" "tutorial_marketplace_import_title" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_import = {{ partial "t.html" (dict "k" "tutorial_marketplace_import" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_import_replay = {{ partial "t.html" (dict "k" "tutorial_marketplace_import_replay" "loc" $.loc) | jsonify }};
lc.tutorial_marketplace_unavailable = {{ partial "t.html" (dict "k" "tutorial_marketplace_unavailable" "loc" $.loc) | jsonify }};

lc.tutorial_deck_title = {{ partial "t.html" (dict "k" "tutorial_deck_title" "loc" $.loc) | jsonify }};
lc.tutorial_deck_intro = {{ partial "t.html" (dict "k" "tutorial_deck_intro" "loc" $.loc) | jsonify }};
lc.tutorial_deck_newcard_title = {{ partial "t.html" (dict "k" "tutorial_deck_newcard_title" "loc" $.loc) | jsonify }};
lc.tutorial_deck_newcard = {{ partial "t.html" (dict "k" "tutorial_deck_newcard" "loc" $.loc) | jsonify }};
lc.tutorial_deck_phrases_title = {{ partial "t.html" (dict "k" "tutorial_deck_phrases_title" "loc" $.loc) | jsonify }};
lc.tutorial_deck_phrases = {{ partial "t.html" (dict "k" "tutorial_deck_phrases" "loc" $.loc) | jsonify }};
lc.tutorial_deck_characters_title = {{ partial "t.html" (dict "k" "tutorial_deck_characters_title" "loc" $.loc) | jsonify }};
lc.tutorial_deck_characters = {{ partial "t.html" (dict "k" "tutorial_deck_characters" "loc" $.loc) | jsonify }};
lc.tutorial_deck_search_title = {{ partial "t.html" (dict "k" "tutorial_deck_search_title" "loc" $.loc) | jsonify }};
lc.tutorial_deck_search = {{ partial "t.html" (dict "k" "tutorial_deck_search" "loc" $.loc) | jsonify }};

lc.tutorial_review_edit_title = {{ partial "t.html" (dict "k" "tutorial_review_edit_title" "loc" $.loc) | jsonify }};
lc.tutorial_review_edit = {{ partial "t.html" (dict "k" "tutorial_review_edit" "loc" $.loc) | jsonify }};
lc.tutorial_review_partof_title = {{ partial "t.html" (dict "k" "tutorial_review_partof_title" "loc" $.loc) | jsonify }};
lc.tutorial_review_partof = {{ partial "t.html" (dict "k" "tutorial_review_partof" "loc" $.loc) | jsonify }};

lc.tutorial_card_ime_title = {{ partial "t.html" (dict "k" "tutorial_card_ime_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_ime = {{ partial "t.html" (dict "k" "tutorial_card_ime" "loc" $.loc) | jsonify }};
lc.tutorial_card_input_title = {{ partial "t.html" (dict "k" "tutorial_card_input_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_input = {{ partial "t.html" (dict "k" "tutorial_card_input" "loc" $.loc) | jsonify }};
lc.tutorial_card_preview_title = {{ partial "t.html" (dict "k" "tutorial_card_preview_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_preview = {{ partial "t.html" (dict "k" "tutorial_card_preview" "loc" $.loc) | jsonify }};
lc.tutorial_card_save_title = {{ partial "t.html" (dict "k" "tutorial_card_save_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_save = {{ partial "t.html" (dict "k" "tutorial_card_save" "loc" $.loc) | jsonify }};

lc.tutorial_phrase_input_title = {{ partial "t.html" (dict "k" "tutorial_phrase_input_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_input = {{ partial "t.html" (dict "k" "tutorial_phrase_input" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_autocards_title = {{ partial "t.html" (dict "k" "tutorial_phrase_autocards_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_autocards = {{ partial "t.html" (dict "k" "tutorial_phrase_autocards" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_save_title = {{ partial "t.html" (dict "k" "tutorial_phrase_save_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_save = {{ partial "t.html" (dict "k" "tutorial_phrase_save" "loc" $.loc) | jsonify }};

lc.tutorial_session_title = {{ partial "t.html" (dict "k" "tutorial_session_title" "loc" $.loc) | jsonify }};
lc.tutorial_session_start = {{ partial "t.html" (dict "k" "tutorial_session_start" "loc" $.loc) | jsonify }};
lc.tutorial_session_replay = {{ partial "t.html" (dict "k" "tutorial_session_replay" "loc" $.loc) | jsonify }};
lc.tutorial_session_done_title = {{ partial "t.html" (dict "k" "tutorial_session_done_title" "loc" $.loc) | jsonify }};
lc.tutorial_session_done = {{ partial "t.html" (dict "k" "tutorial_session_done" "loc" $.loc) | jsonify }};

lc.tutorial_account_stats_title = {{ partial "t.html" (dict "k" "tutorial_account_stats_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_stats = {{ partial "t.html" (dict "k" "tutorial_account_stats" "loc" $.loc) | jsonify }};
lc.tutorial_account_settings_title = {{ partial "t.html" (dict "k" "tutorial_account_settings_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_settings = {{ partial "t.html" (dict "k" "tutorial_account_settings" "loc" $.loc) | jsonify }};

lc.tutorial_card_pron_title = {{ partial "t.html" (dict "k" "tutorial_card_pron_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_pron = {{ partial "t.html" (dict "k" "tutorial_card_pron" "loc" $.loc) | jsonify }};
lc.tutorial_card_defs_title = {{ partial "t.html" (dict "k" "tutorial_card_defs_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_defs = {{ partial "t.html" (dict "k" "tutorial_card_defs" "loc" $.loc) | jsonify }};
lc.tutorial_cardreview_title = {{ partial "t.html" (dict "k" "tutorial_cardreview_title" "loc" $.loc) | jsonify }};
lc.tutorial_cardreview = {{ partial "t.html" (dict "k" "tutorial_cardreview" "loc" $.loc) | jsonify }};
lc.tutorial_cardreview_phrase_title = {{ partial "t.html" (dict "k" "tutorial_cardreview_phrase_title" "loc" $.loc) | jsonify }};
lc.tutorial_cardreview_phrase = {{ partial "t.html" (dict "k" "tutorial_cardreview_phrase" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_pron_title = {{ partial "t.html" (dict "k" "tutorial_phrase_pron_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_pron = {{ partial "t.html" (dict "k" "tutorial_phrase_pron" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_defs_title = {{ partial "t.html" (dict "k" "tutorial_phrase_defs_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_defs = {{ partial "t.html" (dict "k" "tutorial_phrase_defs" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_subcard_title = {{ partial "t.html" (dict "k" "tutorial_phrase_subcard_title" "loc" $.loc) | jsonify }};
lc.tutorial_phrase_subcard = {{ partial "t.html" (dict "k" "tutorial_phrase_subcard" "loc" $.loc) | jsonify }};
lc.tutorial_review_phrase_title = {{ partial "t.html" (dict "k" "tutorial_review_phrase_title" "loc" $.loc) | jsonify }};
lc.tutorial_review_phrase = {{ partial "t.html" (dict "k" "tutorial_review_phrase" "loc" $.loc) | jsonify }};
lc.tutorial_review_navigate_title = {{ partial "t.html" (dict "k" "tutorial_review_navigate_title" "loc" $.loc) | jsonify }};
lc.tutorial_review_navigate = {{ partial "t.html" (dict "k" "tutorial_review_navigate" "loc" $.loc) | jsonify }};

lc.tutorial_card_variant_title = {{ partial "t.html" (dict "k" "tutorial_card_variant_title" "loc" $.loc) | jsonify }};
lc.tutorial_card_variant = {{ partial "t.html" (dict "k" "tutorial_card_variant" "loc" $.loc) | jsonify }};
lc.tutorial_account_extensive_title = {{ partial "t.html" (dict "k" "tutorial_account_extensive_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_extensive = {{ partial "t.html" (dict "k" "tutorial_account_extensive" "loc" $.loc) | jsonify }};
lc.tutorial_account_levelreduce_title = {{ partial "t.html" (dict "k" "tutorial_account_levelreduce_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_levelreduce = {{ partial "t.html" (dict "k" "tutorial_account_levelreduce" "loc" $.loc) | jsonify }};
lc.tutorial_account_goal_title = {{ partial "t.html" (dict "k" "tutorial_account_goal_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_goal = {{ partial "t.html" (dict "k" "tutorial_account_goal" "loc" $.loc) | jsonify }};
lc.tutorial_account_language_title = {{ partial "t.html" (dict "k" "tutorial_account_language_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_language = {{ partial "t.html" (dict "k" "tutorial_account_language" "loc" $.loc) | jsonify }};
lc.tutorial_account_theme_title = {{ partial "t.html" (dict "k" "tutorial_account_theme_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_theme = {{ partial "t.html" (dict "k" "tutorial_account_theme" "loc" $.loc) | jsonify }};
lc.tutorial_account_replay_title = {{ partial "t.html" (dict "k" "tutorial_account_replay_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_replay = {{ partial "t.html" (dict "k" "tutorial_account_replay" "loc" $.loc) | jsonify }};
lc.tutorial_account_clear_title = {{ partial "t.html" (dict "k" "tutorial_account_clear_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_clear = {{ partial "t.html" (dict "k" "tutorial_account_clear" "loc" $.loc) | jsonify }};
lc.tutorial_account_activity_title = {{ partial "t.html" (dict "k" "tutorial_account_activity_title" "loc" $.loc) | jsonify }};
lc.tutorial_account_activity = {{ partial "t.html" (dict "k" "tutorial_account_activity" "loc" $.loc) | jsonify }};

// activity calendar (activity-calendar.js). The {count}/{date} placeholders survive the build and
// are filled in at runtime
lc.activity_legend_less = {{ partial "t.html" (dict "k" "activity_legend_less" "loc" $.loc) | jsonify }};
lc.activity_legend_more = {{ partial "t.html" (dict "k" "activity_legend_more" "loc" $.loc) | jsonify }};
lc.activity_tooltip = {{ partial "t.html" (dict "k" "activity_tooltip" "loc" $.loc) | jsonify }};
lc.activity_tooltip_one = {{ partial "t.html" (dict "k" "activity_tooltip_one" "loc" $.loc) | jsonify }};
lc.activity_tooltip_none = {{ partial "t.html" (dict "k" "activity_tooltip_none" "loc" $.loc) | jsonify }};

// gems, streak freezes and the daily streak goal (account.js, streak-goal.js, main-page.js). The
// {goal}/{gems} placeholders survive the build and are filled in at runtime
lc.streak_goal_label = {{ partial "t.html" (dict "k" "streak-goal-label" "loc" $.loc) | jsonify }};
lc.streak_goal_aria_label = {{ partial "t.html" (dict "k" "streak-goal-aria-label" "loc" $.loc) | jsonify }};
// Singular/plural pair baked from one ui18n switch pattern, like streak_days_count above
lc.streak_goal_sessions = {{ partial "t.html" (dict "k" "streak_goal_sessions" "loc" $.loc) | jsonify }}
lc.streak_goal_sessions_one = {{ partial "t.html" (dict "k" "streak_goal_sessions_one" "loc" $.loc) | jsonify }}
lc.streak_goal_modal_title = {{ partial "t.html" (dict "k" "streak_goal_modal_title" "loc" $.loc) | jsonify }};
lc.streak_goal_modal_body = {{ partial "t.html" (dict "k" "streak_goal_modal_body" "loc" $.loc) | jsonify }};
lc.streak_goal_modal_confirm = {{ partial "t.html" (dict "k" "streak_goal_modal_confirm" "loc" $.loc) | jsonify }};
lc.streak_freeze_needs_goal = {{ partial "t.html" (dict "k" "streak_freeze_needs_goal" "loc" $.loc) | jsonify }};
lc.streak_freeze_full = {{ partial "t.html" (dict "k" "streak_freeze_full" "loc" $.loc) | jsonify }};
lc.streak_freeze_too_expensive = {{ partial "t.html" (dict "k" "streak_freeze_too_expensive" "loc" $.loc) | jsonify }};
lc.gems_amount = {{ partial "t.html" (dict "k" "gems_amount" "loc" $.loc) | jsonify }};
lc.gems_gain = {{ partial "t.html" (dict "k" "gems_gain" "loc" $.loc) | jsonify }};

// privacy-policy consent gate (privacy-consent.js). The modal is built in JS on every page, so its
// strings have to come through here rather than out of a template
lc.privacy_consent_title = {{ partial "t.html" (dict "k" "privacy_consent_title" "loc" $.loc) | jsonify }};
lc.privacy_consent_body = {{ partial "t.html" (dict "k" "privacy_consent_body" "loc" $.loc) | jsonify }};
lc.privacy_consent_link = {{ partial "t.html" (dict "k" "privacy_consent_link" "loc" $.loc) | jsonify }};
lc.privacy_consent_accept = {{ partial "t.html" (dict "k" "privacy_consent_accept" "loc" $.loc) | jsonify }};
