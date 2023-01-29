// Returns an element
function addElement(elType, content, id, classType, type, parentEl)
{
	let el = document.createElement(elType);
	el.className = classType;
	el.id = id;
	el.textContent = content;

	parentEl.appendChild(el);
	return el;
}

function deckmain()
{
	const data = JSON.parse(window.localStorage.getItem('youyinCardData'));
	var deck = document.getElementById("deck");

	for (var val in data["cards"])
	{
		const it = data["cards"][val];

		let div = document.createElement("div");
		div.className = "card centered";
		div.id = `${val}`

		addElement("h3", `${it["name"]} ${it["knowledge"]}/5`, "", "", "", div);
		const target = addElement("div", "", `card-character-target-div-${val}`, "", "", div);
		addElement("p", "Definitions:", "", "", "", div);

		let list = document.createElement("ol");
		for (var i in it["definitions"])
		{
			let f = it["definitions"][i];
			addElement("li", `${f}`, "", "", "", list);
		}
		div.appendChild(list);

		addElement("button", "Edit", `${val}`, "card-button-edit", "submit", div);

		deck.appendChild(div);

		let writer = HanziWriter.create(`card-character-target-div-${val}`, it["character"], {
			width: 100,
			heigt: 100,
			padding: 5,
			showOutline: true,
			strokeAnimationSpeed: 1.25,
			delayBetweenStrokes: 50,
		})
		target.addEventListener('mouseover', function() {
			writer.animateCharacter();
		});
	}
}

deckmain();
