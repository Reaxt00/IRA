const Discord = require("discord.js")
const utils = require("../utils/index.js")
const events = require("events")
const NeDB = require("nedb")
const fs = require("fs")
const Sentencer = require("sentencer")

// CARDMANAGER.JS
// manages updates to card data (userdata.db) via a NeDB database
// i want this to just input and output data and numbers, with other methods handling discord outputs, but the nature of callbacks makes that difficult

// refDB contains every card
var refDB = new NeDB({filename: './refcards.db'})
var db = new NeDB({filename: './carddata.db'})
db.loadDatabase(function (err) {
	if (err) {
		console.log("Failed to load carddata! Err: " + err);
	}
});
refDB.loadDatabase(function (err) {
	if (err) {
		console.log("Failed to load refcards! Err: " + err);
	}
});
db.ensureIndex({fieldName:'owner'}, (err) => {

})

if (process.argv.length > 3) {
	if (process.argv[3] == "clearDB") {
		refDB.remove( {_id: {$exists: true}}, {multi:true}, (err, numRemoved) => {

		})
		db.remove( {_id: {$exists: true}}, {multi:true}, (err, numRemoved) => {

		})
		console.log("Cleared card databases")
	}
}

var refCards = JSON.parse(fs.readFileSync("./events/cards.json"))
let newCards = 0
for (let i=0, len=refCards.length; i < len; i++) {
	if (refCards[i].active) {
		refCards[i].level = 1;
		refDB.update({name: refCards[i].name}, refCards[i], {upsert: true}, function(err, numReplaced, upsert) {
			if (upsert) newCards++
		})
	}
}

// The next three functions use various data to convert a template card into a unique instance card attached to a user.
function createCardFromID(message, user, ref_id) {
	let doc;
	refDB.findOne({_id:ref_id}, function(err, foundDoc) {
		if (err) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")})
		else doc = foundDoc
	})
	doc.owner = user.id
	db.insert(doc, function(err, newDoc) {doc._id = newDoc._id});
	return doc;
}
function createCardFromName(message, user, ref_name) {
	let doc;
	refDB.findOne({name:ref_name}, function(err, foundDoc) {
		if (err) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")})
		else doc = foundDoc
	})
	doc.owner = user.id
	db.insert(doc, function(err, newDoc) {doc._id = newDoc._id});
	return doc;
}
function createCardFromDoc(message, user, doc) {
	doc._id = undefined
	doc.owner = user.id
	db.insert(doc, function(err, newDoc) {
		if (err) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")})

		if (!newDoc) {
			message.channel.send({embed:utils.embed(`malfunction`,`Unknown error - New card was not created!`, "RED")})
		} else {
			doc._id = newDoc._id
		}
	});
	return doc;
}

// Adds a randomly rolled card to a user.
// message: origin message
// user: user to add to
// callback(message, user, newDoc): callback 
function rollCard(message, user, callback) {
	// Roll the rarity of the card.
	let rarity = global.config.pullP.length;
	let randNum = Math.random();
	while (randNum > global.config.pullP[rarity-1] && rarity > 0) {
		rarity--;
	}
	// Fetch a random card of that rarity.
	refDB.find({rarity: rarity, pullable:true}, (err, docs) => {
		if (err) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")})
		if (docs.length == 0) return message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`No pullable cards.\`\`\``, "RED")})

		cardDoc = docs[Math.floor(Math.random() * docs.length)]
		cardDoc = createCardFromDoc(message, user, cardDoc)
		return callback(message, user, cardDoc);
	})
	
}
// callback: function(message, card_doc)
function getCardfromID(message, card_id, callback) {
	db.findOne({_id:card_id}, (err, doc) => {
		if (err) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")}) 
		else callback(message, card_doc)
	})
}
function getCardList(messasge, user, sort) {
	return new Promise((resolve, reject) => {
		if (sort === "power") {
			db.find({owner:user.id}).sort({totalPwr:-1}).exec((err, docs) =>{
				if (docs) resolve(docs)
				else reject("No cards found!")
			})
		} else if (sort === "rarity") {
			db.find({owner:user.id}).sort({rarity:-1, totalPwr:-1}).exec((err, docs) => {
				if (docs) resolve(docs)
				else reject("No cards found!")
			})
		}
		else reject("Invalid sort!")
	})
}
// cardDoc: the card to fuse into
// returns a Promise of the final card
// callback: function(fusedCard, numFused)
function fuseCards(message, user, cardDoc, callback) {
	return new Promise((resolve, reject) => {
		db.findOne({_id:cardDoc._id}, (err, doc) => {
			if (err) {reject("invalid doc")}

			cardDoc = doc;
			if (!cardDoc.level) cardDoc.level = 1;
			let initialLevel = cardDoc.level;
			db.find({name:cardDoc.name, owner:user.id, favorite:{$ne:true}}, (err, docs) => {
				// Fusing a less powerful card with a more powerful card should not allow transferring power to a new set of adjectives.
				// These parameters keep track of that.
				let largestLevel = 0;
				let largestDispName;

				// Upgrade parameters
				let additiveAttack = 0;
				let additiveDefense = 0;
				let additiveLevel = 0;
				let selfFuseAvoided = false; // Helps count how many cards were consumed
				for (let i = 0; i < docs.length; i++) {
					if (docs[i].level > largestLevel) {
						largestLevel = docs[i].level
						largestDispName = docs[i].displayName
					}
					if (docs[i]._id != cardDoc._id) {
						if (!docs[i].level) docs[i].level = 1
						additiveAttack += (docs[i].attack * docs[i].attack)
						additiveDefense += (docs[i].defense * docs[i].defense)
						additiveLevel += docs[i].level * docs[i].level
						db.remove({_id:docs[i]._id}, {}, (err, numRemoved) => {
							if (err || numRemoved === 0) message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")}) 
						}) 
					} else {
						selfFuseAvoided = true;
					}
				}

				cardDoc.level = Math.sqrt((cardDoc.level*cardDoc.level) + additiveLevel)
				cardDoc.attack = Math.sqrt((cardDoc.attack*cardDoc.attack) + additiveAttack)
				cardDoc.defense = Math.sqrt((cardDoc.defense*cardDoc.defense) + additiveDefense)
				cardDoc.totalPwr = cardDoc.attack + cardDoc.defense

				for (let i = initialLevel; i < Math.floor(cardDoc.level); i++) {
					cardDoc.displayName = Sentencer.make("{{ adjective }} " + largestDispName)
					cardDoc.displayName = cardDoc.displayName.charAt(0).toUpperCase() + cardDoc.displayName.substr(1)
				}

				db.update({_id:cardDoc._id}, cardDoc, {}, () => {

				})

				callback(cardDoc, docs.length - selfFuseAvoided)
			})
		})
	})
}

function favoriteCard(message, cardDoc) {
	db.update({_id:cardDoc._id},{$set: {favorite: true} }, {}, (err) => {
		if (err) 
			return message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")}) 
	})
}
function unFavoriteCard(message, cardDoc) {
	db.update({_id:cardDoc._id},{$set: {favorite: false} }, {}, (err) => {
		if (err) 
			return message.channel.send({embed:utils.embed(`malfunction`,`Something went wrong! \`\`\`${err}\`\`\``, "RED")}) 
	})
}


module.exports = {
	database:db,
	refDatabase:refDB,
	rollCard:rollCard,
	getCardList:getCardList,
	fuseCards: fuseCards,
	favoriteCard: favoriteCard,
	unFavoriteCard: unFavoriteCard
}

refDB.count({}, (err, count) => { console.log(`Card Manager initialized with ${count} entries. ${newCards} new cards this boot.`); })
db.count({}, (err, count) => { console.log(` ${count} unique cards have been created.`)})