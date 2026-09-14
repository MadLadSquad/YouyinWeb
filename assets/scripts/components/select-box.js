'use strict';
// ---------------- Shared plumbing for button-triggered popups (language/variant/theme) ----------------
// Every popup registers a controller here; the single document-level click/keydown pair below
// serves all of them, instead of each dropdown installing its own global listeners
window.popupControllers = [];

/**
 * Creates the open/close plumbing for a button-triggered popup: aria-expanded upkeep, mutual
 * exclusion with other popups, toggling on button click, outside-click and Escape handling
 * @param { HTMLElement } button - The trigger button
 * @param { HTMLElement } popup - The popup element
 * @param { function|null } onOpen - Called after the popup opens
 * @param { function|null } onClose - Called after the popup closes
 * @returns { Object } - Controller exposing isOpen(), open(), close() and contains()
 */
function createPopupController(button, popup, onOpen, onClose)
{
    // A closed popup keeps its box in the layout (the closed state only sets opacity/visibility, not
    // display), and these popups are up to 80-90vw wide and centred on a footer button that drifts
    // toward the screen edge as the footer stops wrapping on wider phones. That overhang expands the
    // layout viewport and gives every page a spurious horizontal scroll/zoom-out on mobile. Taking the
    // popup out of flow with display:none while closed removes that overhang entirely. We toggle
    // display around the existing opacity/transform transition (reflow between display and .open on
    // open; restore display:none only after the exit transition on close) so the animation still plays.
    const TRANSITION_MS = 200;
    let hideTimer = null;
    popup.style.display = "none";

    const controller = {
        button: button,
        popup: popup,
        isOpen: () => popup.classList.contains("open"),
        open: () =>
        {
            // Only one popup may be open at a time
            for (const other of window.popupControllers)
                if (other !== controller)
                    other.close();

            if (hideTimer !== null)
            {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            popup.style.display = "";
            // Force a reflow so the closed state is the transition's start frame, then animate open.
            // onOpen below measures the popup (clampPopupHorizontally), which needs it laid out first.
            void popup.offsetWidth;
            popup.classList.add("open");
            button.setAttribute("aria-expanded", "true");
            if (onOpen)
                onOpen();
        },
        close: () =>
        {
            if (!controller.isOpen())
                return;
            popup.classList.remove("open");
            button.setAttribute("aria-expanded", "false");
            // Pull the popup back out of flow once it has finished animating shut, so it stops
            // widening the page again. Guard against a re-open during the wait.
            hideTimer = setTimeout(() => {
                hideTimer = null;
                if (!controller.isOpen())
                    popup.style.display = "none";
            }, TRANSITION_MS + 50);
            if (onClose)
                onClose();
        },
        contains: (target) => popup.contains(target) || button.contains(target),
    };

    button.addEventListener("click", (e) => {
        e.stopPropagation();
        controller.isOpen() ? controller.close() : controller.open();
    });

    window.popupControllers.push(controller);
    return controller;
}

// Close on click outside and on Escape, for every registered popup
document.addEventListener("click", (e) => {
    for (const controller of window.popupControllers)
        if (controller.isOpen() && !controller.contains(e.target))
            controller.close();
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape")
        return;
    for (const controller of window.popupControllers)
    {
        if (controller.isOpen())
        {
            e.preventDefault();
            controller.close();
            controller.button.focus();
        }
    }
});

/**
 * Nudges a button-anchored popup horizontally so it never spills past the viewport edges on narrow
 * screens. These popups are centred on their trigger button (left at the button centre plus a
 * translateX(-50%)), so a button near a screen edge would otherwise push part of the popup — the
 * flag emoji, theme names — off-screen. Works out the popup's natural centred left from the button
 * rect and the popup's own width (offsetWidth ignores the open animation's scale, so it's stable)
 * and applies any needed correction as margin-left, leaving the centring/animation transform intact.
 * Works for both position:fixed (theme) and position:absolute (language/variant) popups
 * @param { HTMLElement } popup - The popup element
 * @param { DOMRect } anchorRect - The trigger button's bounding rect
 */
function clampPopupHorizontally(popup, anchorRect)
{
    const MARGIN = 8;
    const width = popup.offsetWidth;
    // clientWidth, not innerWidth: innerWidth counts the classic scrollbar, so on a desktop with one
    // the popup was being allowed to sit up to its width underneath
    const viewportWidth = document.documentElement.clientWidth;
    const left = anchorRect.left + anchorRect.width / 2 - width / 2;
    let shift = 0;
    if (left + width > viewportWidth - MARGIN)
        shift = (viewportWidth - MARGIN) - (left + width);
    else if (left < MARGIN)
        shift = MARGIN - left;
    popup.style.marginLeft = `${shift}px`;
}

/**
 * Picks which side of its trigger a button-anchored popup opens on. These popups default to opening
 * upward, which is what the footer pickers wanted, but the same widget now also runs in the app bar
 * at the very top of the page (and in the middle of the account page's settings list) where opening
 * upward puts it off-screen entirely. Flip below whenever there isn't room above.
 *
 * Only for the position:absolute popups built by createCustomSelect - the theme picker is
 * position:fixed and does this arithmetic itself against the viewport (see theme-selector.js).
 * @param { HTMLElement } popup - The popup element, already laid out (display cleared by open())
 * @param { DOMRect } anchorRect - The trigger button's bounding rect
 */
function positionPopupVertically(popup, anchorRect)
{
    const GAP = 8;
    // offsetHeight ignores the open animation's scale, so it is stable whichever frame we land on
    const height = popup.offsetHeight;
    const spaceAbove = anchorRect.top - GAP;
    const spaceBelow = window.innerHeight - anchorRect.bottom - GAP;
    popup.classList.toggle("drop-below", spaceAbove < height && spaceBelow > spaceAbove);
}

/**
 * Creates a custom dropdown select box styled like the theme switcher.
 * @param {HTMLElement} button - The button element that will act as the trigger.
 * @param {string} ariaLabel - Accessibility label.
 * @param {Array<{value: string, text: string}>} options - Array of option objects.
 * @param {string} initialValue - Initial selected value.
 * @param {Function} onChange - Callback triggered when the value changes.
 * @returns {HTMLElement} The button element.
 */
function createCustomSelect(button, ariaLabel, options, initialValue, onChange)
{
    // Ensure the trigger button has the correct classes and attributes. Add rather than overwrite:
    // the markup may have given the button presentation classes of its own (the header's icon-only
    // language/theme buttons carry the shared button styling), and an assignment to className would
    // silently drop them. The two classes below are the ones this widget's CSS needs; anything else
    // on the button is the caller's business.
    button.classList.add("list-select-button", "centered");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", ariaLabel);

    // Create a wrapper container to position the popup relative to the button
    const container = document.createElement("div");
    container.className = "list-select-container";

    // Move the button into a positioning wrapper. If the button isn't in the DOM yet there is nowhere
    // to anchor the wrapper, and appending the button into the never-inserted container would just
    // yank the whole widget off the page silently. Refuse instead of losing it.
    if (button.parentNode === null)
    {
        console.error("createCustomSelect: button is not attached to the DOM; skipping select box", button);
        return button;
    }
    button.parentNode.insertBefore(container, button);
    container.appendChild(button);

    let activeValue = initialValue;

    // Find the text for initial value
    const initialOpt = options.find(o => o.value === initialValue);
    button.textContent = initialOpt ? initialOpt.text : initialValue;

    // Create popup
    const popup = document.createElement("div");
    popup.className = "list-select-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", ariaLabel);
    container.appendChild(popup);

    // Create list container
    const list = document.createElement("div");
    list.className = "list-select-list";
    popup.appendChild(list);

    const optionButtons = {};

    const controller = createPopupController(button, popup, function() {
        const rect = button.getBoundingClientRect();
        // Open downward when there is no room above - the app bar's language picker has ~12px
        clampPopupHorizontally(popup, rect);
        positionPopupVertically(popup, rect);
        // Focus the active option when opening
        if (optionButtons[activeValue])
            optionButtons[activeValue].focus();
    }, null);

    // Build options
    for (const opt of options)
    {
        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.className = "list-select-option" + (opt.value === activeValue ? " active" : "");
        optBtn.textContent = opt.text;

        optBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            activeValue = opt.value;
            button.textContent = opt.text;

            for (const val in optionButtons) {
                optionButtons[val].classList.toggle("active", val === activeValue);
            }

            controller.close();
            button.focus();

            if (onChange) {
                onChange(activeValue);
            }
        });

        list.appendChild(optBtn);
        optionButtons[opt.value] = optBtn;
    }

    // Return an object that mirrors a select element's value property
    // so it can be queried or set from elsewhere if needed.
    Object.defineProperty(button, "value", {
        get() { return activeValue; },
        set(val) {
            const found = options.find(o => o.value === val);
            if (found) {
                activeValue = val;
                button.textContent = found.text;
                for (const v in optionButtons) {
                    optionButtons[v].classList.toggle("active", v === val);
                }
            }
        },
        configurable: true
    });

    return button;
}
