'use strict';

var soundTables = {};

/**
 * Convert each word in a sentence to pinyin
 * @param {string} string - The input non-pinyin string
 * @param { number } _ - We usually receive an index, but the pin1yin1 notation doesn't need it, since it's part of the
 * string. Feel free to set this to anything
 * @returns {string} - The output pinyin-ified string
 */
function pinyinify(string, _) {
    let arr = string.toLowerCase().split(' ');

    // Pinyin-ify every element
    for (let i in arr)
    {
        for (const [key, val] of Object.entries(soundTables.pinyin.table))
        {
            if (arr[i].includes(key))
            {
                let lastEl = arr[i].at(arr[i].length - 1);
                let index = 5;
                // Check if the number at the back is above 0 and less than 6 since we don't support Jyutping(it doesn't have markings anyway)
                if (lastEl >= '0' && lastEl <= '5')
                {
                    index = parseInt(lastEl);
                    arr[i] = arr[i].substring(0, arr[i].length - 1);
                    if (lastEl === '0')
                        index = 5;
                }
                arr[i] = arr[i].replace(key, val[index - 1]);
            }
        }
    }
    return arr.join(" ");
}

/**
 * Convert a Romaji string to Hiragana or Katakana
 * @param { string } string - The input string
 * @param { number } bKatakana - Whether to convert to Katakana or not. Treat this as a boolean
 * @return { string } The output string
 */
function fromRomaji(string, bKatakana)
{
    string = string.toLowerCase();
    for (const [key, val] of Object.entries(soundTables.romaji.table))
    {
        // Yet another Javascript rant: In most languages, booleans are just numeric values, however Javascript is
        // retarded and all the values there are strings. We could convert it to an integer or
        // use the unary + operator(UGLY AS SHIT -> "val[+bKatakana]"), however it's extremely slow. Turns out, the
        // fastest solution is to use a ternary operation... I cannot even...
        string = string.replaceAll(key, val[bKatakana >= 1 ? 1 : 0]);
    }
    return string;
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

soundTables.cyrillic =
{
    table:
    {
        "a": "",
        "b": "",
        "v": "",
        "g": "",
        "gh": "",
        "g'": "",
        "dj": "",
        "e": "",
        "yo": "",
        "je": "",
        "zh": "",
        "z": "",
        "dz": "",
        "ii": "",
        "yi": "",
        "j": "",
        "": "",
    },
}

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
        "shu":  [ "しゃ", "シャ" ],
        "sho":  [ "しゅ", "シュ" ],
        "sya":  [ "しゅ", "シュ" ],
        "syu":  [ "しょ", "ショ" ],
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
        "dyu":  [ "ぢゅ", "ヂャ" ],
        "dju":  [ "ぢゅ", "ヂャ" ],
        "dzyu": [ "ぢゅ", "ヂャ" ],
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