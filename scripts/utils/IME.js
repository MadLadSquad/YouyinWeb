'use strict';

var soundTables = {};

/**
 * Convert each word in a sentence to pinyin. The notation is one syllable per whitespace-separated
 * token, each carrying a single trailing tone digit (1-4, with 0 or 5 meaning the neutral tone) — so
 * "ni3 hao3" -> "nǐ hǎo". A token without a digit is left in its neutral form.
 * @param {string} string - The input non-pinyin string
 * @param { number } _ - We usually receive an index, but the pin1yin1 notation doesn't need it, since it's part of the
 * string. Feel free to set this to anything
 * @returns {string} - The output pinyin-ified string
 */
function pinyinify(string, _) {
    let arr = string.toLowerCase().split(' ');

    // Pinyin-ify every element
    for (let i = 0; i < arr.length; i++)
    {
        let syllable = arr[i];

        // The tone is a single trailing digit; a syllable has exactly one, so strip it once up front
        // rather than re-checking the tail on every key. 0 and 5 both denote the neutral (unmarked)
        // tone. We don't support Jyutping (tones 6+ have no diacritics anyway).
        let toneIndex = 5;
        const lastEl = syllable.at(-1);
        if (lastEl >= '0' && lastEl <= '5')
        {
            toneIndex = (lastEl === '0') ? 5 : parseInt(lastEl, 10);
            syllable = syllable.slice(0, -1);
        }

        // Place the tone mark on the correct vowel and stop. The table is ordered so the first key
        // that occurs in the syllable is the vowel the mark belongs on (vowel clusters precede single
        // vowels), so the first match is the only replacement — without the break, later keys would
        // re-match the remaining plain vowels and re-run at the neutral tone.
        for (const [key, val] of Object.entries(soundTables.pinyin.table))
        {
            if (syllable.includes(key))
            {
                syllable = syllable.replace(key, val[toneIndex - 1]);
                break;
            }
        }

        arr[i] = syllable;
    }
    return arr.join(" ");
}

// A romaji consonant is any latin letter that isn't one of the five vowels. Used to detect the
// geminate (doubled-consonant) sokuon and the syllabic n below.
function isRomajiConsonant(c)
{
    return c >= "a" && c <= "z" && !"aiueo".includes(c);
}

/**
 * Convert a Romaji string to Hiragana or Katakana.
 *
 * Rather than a table sweep of replaceAll (which is order-dependent and can't tell "n" the syllable
 * ん from "n" the start of "na", nor produce the doubled-consonant っ), this walks the input left to
 * right and, at each position, greedily takes the longest romaji key that matches. Two constructs are
 * handled before the table lookup because they don't have their own literal keys:
 *   - the syllabic n (ん): an "n" not followed by a vowel or "y" — e.g. "zannen" -> "ざんねん";
 *   - the sokuon (っ): a doubled consonant, e.g. "kitte" -> "きって", plus the "tch" spelling of っち.
 * @param { string } string - The input string
 * @param { number } bKatakana - Whether to convert to Katakana or not. Treat this as a boolean
 * @return { string } The output string
 */
function fromRomaji(string, bKatakana)
{
    const table = soundTables.romaji.table;
    // The kana column: 0 = hiragana, 1 = katakana. Resolve it once instead of per character.
    const kana = bKatakana >= 1 ? 1 : 0;
    const sokuon = ["っ", "ッ"][kana];
    const syllabicN = ["ん", "ン"][kana];

    const input = string.toLowerCase();
    let out = "";
    let i = 0;
    while (i < input.length)
    {
        const c = input[i];
        const next = input[i + 1] || "";

        // Sokuon: a consonant doubled before its own kana marks gemination ("kitte" -> きって). The
        // "tch" spelling is the conventional way to write っ before ち ("matcha" -> まっちゃ). "n" is
        // excluded — "nn" is the syllabic ん, handled below.
        if (c !== "n" && isRomajiConsonant(c) &&
            (c === next || (c === "t" && input.substr(i + 1, 2) === "ch")))
        {
            out += sokuon;
            i++;
            continue;
        }

        // Syllabic n (ん): an "n" that doesn't begin a na/ni/nu/ne/no or nya/nyu/nyo syllable — i.e.
        // one followed by a consonant, another "n", or the end of the input. `next` is "" at the end
        // of the string, which is not a vowel (guard the empty case: "aiueo".includes("") is true).
        const nextIsVowel = next !== "" && "aiueo".includes(next);
        if (c === "n" && next !== "y" && !nextIsVowel)
        {
            out += syllabicN;
            i++;
            continue;
        }

        // Longest-match the table: try 4-, 3-, 2- then 1-character keys so a multi-letter kana
        // ("kya", "sha", "tsu") wins over its shorter prefixes ("ka"/"ki", "sa"/"shi", "tu").
        let matched = false;
        for (let len = 4; len >= 1; len--)
        {
            const chunk = input.substr(i, len);
            if (chunk.length === len && Object.prototype.hasOwnProperty.call(table, chunk))
            {
                out += table[chunk][kana];
                i += len;
                matched = true;
                break;
            }
        }

        // No kana for this position (a space, punctuation, or a stray consonant): pass it through.
        if (!matched)
        {
            out += c;
            i++;
        }
    }
    return out;
}


soundTables.pinyin =
{
    table:
    {
        "uai":  [ "uāi",    "uái",      "uǎi",      "uài",      "uai"   ],
        "ua":   [ "uā",     "uá",       "uǎ",       "uà",       "ua"    ],
        "ue":   [ "uē",     "ué",       "uě",       "uè",       "ue"    ],
        "ui":   [ "uī",     "uí",       "uǐ",       "uì",       "ui"    ],
        "uo":   [ "uō",     "uó",       "uǒ",       "uò",       "uo"    ],
        "va":   [ "üā",     "üá",       "üǎ",       "üà",       "üa"    ],
        "ve":   [ "üē",     "üé",       "üě",       "üè",       "üe"    ],
        "ai":   [ "āi",     "ái",       "ǎi",       "ài",       "ai"    ],
        "iao":  [ "iāo",    "iáo",      "iǎo",      "iào",      "iao"   ],
        "ao":   [ "āo",     "áo",       "ǎo",       "ào",       "ao"    ],
        "ei":   [ "ēi",     "éi",       "ěi",       "èi",       "ei"    ],
        "ia":   [ "iā",     "iá",       "iǎ",       "ià",       "ia"    ],
        "ie":   [ "iē",     "ié",       "iě",       "iè",       "ie"    ],
        "io":   [ "iō",     "ió",       "iǒ",       "iò",       "io"    ],
        "iu":   [ "iū",     "iú",       "iǔ",       "iù",       "iu"    ],
        "ou":   [ "ōu",     "óu",       "ǒu",       "òu",       "ou"    ],
        "a":    [ "ā",      "á",        "ǎ",        "à",        "a"     ],
        "e":    [ "ē",      "é",        "ě",        "è",        "e"     ],
        "i":    [ "ī",      "í",        "ǐ",        "ì",        "i"     ],
        "o":    [ "ō",      "ó",        "ǒ",        "ò",        "o"     ],
        "u":    [ "ū",      "ú",        "ǔ",        "ù",        "u"     ],
        "v":    [ "ǖ",      "ǘ",        "ǚ",        "ǜ",        "ü"     ],
    },
    convert: pinyinify,
};

soundTables.romaji =
{
    table:
    {
        "kya":  [ "きゃ", "キャ" ],
        "kyu":  [ "きゅ", "キュ" ],
        "kyo":  [ "きょ", "キョ" ],

        "ka":   [ "か", "カ" ],
        "ki":   [ "き", "キ" ],
        "ku":   [ "く", "ク" ],
        "ke":   [ "け", "ケ" ],
        "ko":   [ "こ", "コ" ],

        "sha":  [ "しゃ", "シャ" ],
        "shu":  [ "しゅ", "シュ" ],
        "sho":  [ "しょ", "ショ" ],
        "sya":  [ "しゃ", "シャ" ],
        "syu":  [ "しゅ", "シュ" ],
        "syo":  [ "しょ", "ショ" ],

        "cha":  [ "ちゃ", "チャ" ],
        "tya":  [ "ちゃ", "チャ" ],
        "chu":  [ "ちゅ", "チュ" ],
        "tyu":  [ "ちゅ", "チュ" ],
        "cho":  [ "ちょ", "チョ" ],
        "tyo":  [ "ちょ", "チョ" ],

        "ltu":  [ "っ", "ッ" ],
        "ltsu": [ "っ", "ッ" ],
        "lya":  [ "ゃ", "ャ" ],
        "lyu":  [ "ゅ", "ュ" ],
        "lyo":  [ "ょ", "ョ" ],

        "ta":   [ "た", "タ" ],
        "chi":  [ "ち", "チ" ],
        "ti":   [ "ち", "チ" ],
        "xtu":  [ "っ", "ッ" ],
        "xtsu": [ "っ", "ッ" ],
        "tsu":  [ "つ", "ツ" ],
        "tu":   [ "つ", "ツ" ],
        "te":   [ "て", "テ" ],
        "to":   [ "と", "ト" ],

        "sa":   [ "さ", "サ" ],
        "shi":  [ "し", "シ" ],
        "si":   [ "し", "シ" ],
        "su":   [ "す", "ス" ],
        "se":   [ "せ", "セ" ],
        "so":   [ "そ", "ソ" ],

        "nya":  [ "にゃ", "ニャ" ],
        "nyu":  [ "にゅ", "ニュ" ],
        "nyo":  [ "にょ", "ニョ" ],

        "na":   [ "な", "ナ" ],
        "ni":   [ "に", "ニ" ],
        "nu":   [ "ぬ", "ヌ" ],
        "ne":   [ "ね", "ネ" ],
        "no":   [ "の", "ノ" ],

        "hya":  [ "ひゃ", "ヒャ" ],
        "hyu":  [ "ひゅ", "ヒュ" ],
        "hyo":  [ "ひょ", "ヒョ" ],

        "ha":   [ "は", "ハ" ],
        "hi":   [ "ひ", "ヒ" ],
        "hu":   [ "ふ", "フ" ],
        "fu":   [ "ふ", "フ" ],
        "he":   [ "へ", "ヘ" ],
        "ho":   [ "ほ", "ホ" ],

        "mya":  [ "みゃ", "ミャ" ],
        "myu":  [ "みゅ", "ミュ" ],
        "myo":  [ "みょ", "ミョ" ],

        "ma":   [ "ま", "マ" ],
        "mi":   [ "み", "ミ" ],
        "mu":   [ "む", "ム" ],
        "me":   [ "め", "メ" ],
        "mo":   [ "も", "モ" ],

        "rya":  [ "りゃ", "リャ" ],
        "ryu":  [ "りゅ", "リュ" ],
        "ryo":  [ "りょ", "リョ" ],

        "ra":   [ "ら", "ラ" ],
        "ri":   [ "り", "リ" ],
        "ru":   [ "る", "ル" ],
        "re":   [ "れ", "レ" ],
        "ro":   [ "ろ", "ロ" ],

        "gya":  [ "ぎゃ", "ギャ" ],
        "gyu":  [ "ぎゅ", "ギュ" ],
        "gyo":  [ "ぎょ", "ギョ" ],

        "ga":   [ "が", "ガ" ],
        "gi":   [ "ぎ", "ギ" ],
        "gu":   [ "ぐ", "グ" ],
        "ge":   [ "げ", "ゲ" ],
        "go":   [ "ご", "ゴ" ],

        "zya":  [ "じゃ", "ジャ" ],
        "ja":   [ "じゃ", "ジャ" ],
        "zyu":  [ "じゅ", "ジュ" ],
        "ju":   [ "じゅ", "ジュ" ],
        "zyo":  [ "じょ", "ジョ" ],
        "jo":   [ "じょ", "ジョ" ],

        "da":   [ "だ", "ダ" ],
        "di":   [ "ぢ", "ヂ" ],
        "dji":  [ "ぢ", "ヂ" ],
        "dzi":  [ "ぢ", "ヂ" ],
        "du":   [ "づ", "ヅ" ],
        "dzu":  [ "づ", "ヅ" ],
        "de":   [ "で", "デ" ],
        "do":   [ "ど", "ド" ],

        "za":   [ "ざ", "ザ" ],
        "zi":   [ "じ", "ジ" ],
        "ji":   [ "じ", "ジ" ],
        "zu":   [ "ず", "ズ" ],
        "ze":   [ "ぜ", "ゼ" ],
        "zo":   [ "ぞ", "ゾ" ],

        "dya":  [ "ぢゃ", "ヂャ" ],
        "dja":  [ "ぢゃ", "ヂャ" ],
        "dzya": [ "ぢゃ", "ヂャ" ],
        "dyu":  [ "ぢゅ", "ヂュ" ],
        "dju":  [ "ぢゅ", "ヂュ" ],
        "dzyu": [ "ぢゅ", "ヂュ" ],
        "dyo":  [ "ぢょ", "ヂョ" ],
        "djo":  [ "ぢょ", "ヂョ" ],
        "dzyo": [ "ぢょ", "ヂョ" ],

        "bya":  [ "びゃ", "ビャ" ],
        "byu":  [ "びゅ", "ビュ" ],
        "byo":  [ "びょ", "ビョ" ],

        "ba":   [ "ば", "バ" ],
        "bi":   [ "び", "ビ" ],
        "bu":   [ "ぶ", "ブ" ],
        "be":   [ "べ", "ベ" ],
        "bo":   [ "ぼ", "ボ" ],

        "pya":  [ "ぴゃ", "ピャ" ],
        "pyu":  [ "ぴゅ", "ピュ" ],
        "pyo":  [ "ぴょ", "ピョ" ],

        "pa":   [ "ぱ", "パ" ],
        "pi":   [ "ぴ", "ピ" ],
        "pu":   [ "ぷ", "プ" ],
        "pe":   [ "ぺ", "ペ" ],
        "po":   [ "ぽ", "ポ" ],

        "xya":  [ "ゃ", "ャ" ],
        "xyu":  [ "ゅ", "ュ" ],
        "xyo":  [ "ょ", "ョ" ],

        "wa":   [ "わ", "ワ" ],
        "wi":   [ "ゐ", "ヰ" ],
        "we":   [ "ゑ", "ヱ" ],
        "wo":   [ "を", "ヲ" ],

        "nn":   [ "ん", "ン" ],

        "vu":   [ "ゔ", "ヴ" ],

        "xa":   [ "ぁ", "ァ" ],
        "xi":   [ "ぃ", "ィ" ],
        "xu":   [ "ぅ", "ゥ" ],
        "xe":   [ "ぇ", "ェ" ],
        "xo":   [ "ぉ", "ォ" ],

        "la":   [ "ぁ", "ァ" ],
        "li":   [ "ぃ", "ィ" ],
        "lu":   [ "ぅ", "ゥ" ],
        "le":   [ "ぇ", "ェ" ],
        "lo":   [ "ぉ", "ォ" ],

        "ya":   [ "や", "ヤ" ],
        "yu":   [ "ゆ", "ユ" ],
        "yo":   [ "よ", "ヨ" ],

        "a":    [ "あ", "ア" ],
        "i":    [ "い", "イ" ],
        "u":    [ "う", "ウ" ],
        "e":    [ "え", "エ" ],
        "o":    [ "お", "オ" ],

        "-":    [ "-", "ー" ],
    },
    convert: fromRomaji
}
