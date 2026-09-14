'use strict';
// Tutorial: card/phrase editor stages (deck-edit-card page) — create 好, then the 你好 phrase.
//
// Loaded only on deck-edit-card.html, before the shared footer so these stage functions are defined before
// footer's tutorial.js runs tutDispatch (it only routes to them at call time, by which point the cross-page
// core in scripts/components/tutorial.js — helpers, tutRunTour, tutDispatch — exists). The form-filling
// helpers below are used only by these editor stages, so they live here rather than in the global core.

// ---------------------------------------------------------------------------------------------------------
// Editor form helpers
// ---------------------------------------------------------------------------------------------------------

// Sets an input's value and fires the change event the editor listens for, so the live preview / per-card
// rebuild happens exactly as if the user had typed and committed the value.
function tutFillField(id, value)
{
    const input = $(id);
    if (!input)
        return;
    input.value = value;
    input.dispatchEvent(new Event("change"));
}

// Adds one definition to a card/phrase edit form: fills the meaning input and triggers the "+" button the
// editor wires through runEventAfterAnimation (deck-new.js).
function tutAddDefinition(index, value)
{
    const field = $(`meaning-text-field-${index}`);
    if (!field)
        return;
    field.value = value;
    tutTriggerButton($(`add-meaning-list-button-${index}`));
}

// Adds several definitions one at a time, with a small pause so the user sees them appear in sequence.
async function tutAddDefinitions(index, values)
{
    for (const value of values)
    {
        tutAddDefinition(index, value);
        await tutDelay(500);
    }
}

// ---------------------------------------------------------------------------------------------------------
// Card creation (好) — first run only
// ---------------------------------------------------------------------------------------------------------

async function tutRunCreateCard()
{
    await tutWaitFor(() => $("character-text-field-0"));

    tutRunTour([
        {
            element: "#input-mode",
            title: lc.tutorial_card_ime_title,
            description: lc.tutorial_card_ime,
            side: "bottom",
        },
        {
            element: "#name-text-field-0",
            title: lc.tutorial_card_pron_title,
            description: lc.tutorial_card_pron,
            side: "bottom",
            onHighlighted: () => tutFillField("name-text-field-0", "hǎo"),
        },
        {
            element: "#character-text-field-0",
            title: lc.tutorial_card_input_title,
            description: lc.tutorial_card_input,
            side: "bottom",
            onHighlighted: () => tutFillField("character-text-field-0", "好"),
        },
        {
            // The variant select is rebuilt for the new character; it always offers at least the default,
            // plus any Japanese (Kanji) / Korean (Hanja) form present in the stroke database. Open it so
            // the user sees the available variants (pointer-events disabled so they can't change it here).
            element: "#character-variant-box-0",
            title: lc.tutorial_card_variant_title,
            description: lc.tutorial_card_variant,
            openBox: "character-variant-box-0",
        },
        {
            element: "#character-preview-0",
            title: lc.tutorial_card_preview_title,
            description: lc.tutorial_card_preview,
            side: "left",
        },
        {
            element: "#meaning-text-field-0",
            title: lc.tutorial_card_defs_title,
            description: lc.tutorial_card_defs,
            side: "bottom",
            onHighlighted: () => tutAddDefinitions(0, ["good", "fine", "ok"]),
        },
        {
            element: "#finish-edit-button",
            title: lc.tutorial_card_save_title,
            description: lc.tutorial_card_save,
            side: "top",
            onNext: () => {
                // Card saved; the finish handler navigates to the deck page, where the orchestrator picks
                // up the card-review stage.
                tutSetStep(TUT.cardReview);
                tutTriggerButton($("finish-edit-button"));
                return false;
            },
        },
    ]);
}

// ---------------------------------------------------------------------------------------------------------
// Phrase creation (你好, reusing 好 and creating 你) — first run only
// ---------------------------------------------------------------------------------------------------------

async function tutRunCreatePhrase()
{
    await tutWaitFor(() => $("character-text-field-phrase"));

    tutRunTour([
        {
            element: "#name-text-field-phrase",
            title: lc.tutorial_phrase_pron_title,
            description: lc.tutorial_phrase_pron,
            side: "bottom",
            onHighlighted: () => tutFillField("name-text-field-phrase", "nǐ hǎo"),
        },
        {
            element: "#character-text-field-phrase",
            title: lc.tutorial_phrase_input_title,
            description: lc.tutorial_phrase_input,
            side: "bottom",
            // Typing the phrase rebuilds the per-character edit cards, so do it on Next (which replaces the
            // input element) rather than on highlight, to avoid Driver holding a stale reference.
            onNext: () => { tutFillField("character-text-field-phrase", "你好"); return true; },
        },
        {
            element: "#meaning-text-field-phrase",
            title: lc.tutorial_phrase_defs_title,
            description: lc.tutorial_phrase_defs,
            side: "bottom",
            onHighlighted: () => tutAddDefinitions("phrase", ["hello"]),
        },
        {
            element: "#edit-phrase-0",
            title: lc.tutorial_phrase_subcard_title,
            description: lc.tutorial_phrase_subcard,
            side: "top",
            // The unknown 你 card (index 0) gets its own pronunciation and meaning; 好 (index 1) was reused.
            onHighlighted: async () => {
                tutFillField("name-text-field-0", "nǐ");
                await tutAddDefinitions(0, ["you"]);
            },
        },
        {
            element: "#finish-edit-button",
            title: lc.tutorial_phrase_save_title,
            description: lc.tutorial_phrase_save,
            side: "top",
            onNext: () => {
                tutSetStep(TUT.deckReview);
                tutTriggerButton($("finish-edit-button"));
                return false;
            },
        },
    ]);
}
