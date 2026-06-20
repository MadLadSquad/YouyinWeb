'use strict';
// Shared number/time formatting helpers used by the deck and main practice pages. getLocalisedTimePostfix
// reads the lc translation object (i18n.js) and the *_UNIX time-unit constants (index.js); both are
// globals available by the time these run

/**
 * Formats a number to 2 decimal places using a dot as the decimal separator.
 * @param { number|string } num - The number to format
 * @returns { string } - Formatted string
 */
function formatDecimal(num)
{
    const parsed = parseFloat(num);
    if (isNaN(parsed))
        return "0.00";
    return parsed.toFixed(2);
}

/**
 * Returns a localised postfix given a time. Also converts time units
 * @param { number } time - in milliseconds
 * @returns { Object<number, string> } - The postfix
 */
function getLocalisedTimePostfix(time)
{
    // I FUCKING HATE NOT HAVING PASS BY REFERENCE IN JAVASCRIPT
    let rt = {
        time: time,
        postfix: lc.milliseconds
    }

    if (time > window.HOUR_UNIX)
    {
        rt.time /= window.HOUR_UNIX;
        rt.postfix = lc.hours;
    }
    else if (time > window.MINUTE_UNIX)
    {
        rt.time /= window.MINUTE_UNIX;
        rt.postfix = lc.minutes;
    }
    else if (time > window.SECOND_UNIX)
    {
        rt.time /= window.SECOND_UNIX;
        rt.postfix = lc.seconds;
    }
    return rt;
}
