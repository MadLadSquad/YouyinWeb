function setTitleName()
{
	const el = document.getElementById("site-title")
	// Cool array of quirky names for the website title because who needs to be serious
	const names = [ "卣囙", "诱因", "油印", "Yǒuyīn", "📮📮", "ඞඞ", "ඣ",
		"爱汉字", "愛カタカナ", "愛ひらがな", "愛漢字",
		"❤️ Latin", "❤️ Кирилица", "❤️  მხედრული", "❤️ Հայոց գրեր", "❤️ العربية", "❤️ 한글", "❤️ Ελληνικά", "❤️ देवनागरी "
	]
	el.innerHTML += names[Math.floor(Math.random() * names.length)]
}

setTitleName()


