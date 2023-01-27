function deckmain()
{
	var writer = HanziWriter.create('card-character-target-div', '概', {
		width: 100,
		height: 100,
		padding: 5,
		showOutline: true,
		strokeAnimationSpeed: 1.25,
		delayBetweenStrokes: 50,
	});

	var writer2 = HanziWriter.create('card-character-target-div-2', '概', {
		width: 100,
		height: 100,
		padding: 5,
		showOutline: true,
		strokeAnimationSpeed: 1.25,
		delayBetweenStrokes: 50,
	});

	document.getElementById('card-character-target-div').addEventListener('mouseover', function() {
		writer.animateCharacter();
	});

	document.getElementById('card-character-target-div-2').addEventListener('mouseover', function() {
		writer2.animateCharacter();
	});

	var writer3 = HanziWriter.create('card-character-target-div-3', '概', {
		width: 100,
		height: 100,
		padding: 5,
		showOutline: true,
		strokeAnimationSpeed: 1.25,
		delayBetweenStrokes: 50,
	});

	document.getElementById('card-character-target-div-3').addEventListener('mouseover', function() {
		writer3.animateCharacter();
	});
}

deckmain();
