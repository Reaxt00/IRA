fs = require("fs");
var commandList = [] // an array containing the name of each command indexed here.
fs.readdirSync("./general/").forEach(file => { // Get files in this directory and add a corresponding require if .js
	if (file.endsWith(".js") && file != "index.js") {
		var commandName = file.split(".js")[0];
		var thisCommand = require("./"+file);
		module.exports[commandName] = thisCommand;
		commandList.push(commandName);
	}
});

module.exports.commandList = commandList;
module.exports.refresh = () => { 
	var commandList = []
	fs.readdirSync("./general/").forEach(file => {
		if (file.endsWith(".js") && file != "index.js") {
			delete require.cache[require.resolve("./"+file)];
			var commandName = file.split(".js")[0];
			var thisCommand = require("./"+file);
			module.exports[commandName] = thisCommand;
			commandList.push(commandName);
		}
	});
	module.exports.commandList = commandList;
}

/**
var yes= require("./yes.js")
var ping = require("./ping.js")
var help = require("./help.js")
var videolink = require("./videolink.js")
module.exports.refresh = () => {
    delete require.cache[require.resolve('./ping.js')];
    delete require.cache[require.resolve('./yes.js')];
    delete require.cache[require.resolve('./help.js')]
    delete require.cache[require.resolve('./videolink.js')]
    ping = require('./ping.js');
    yes = require('./yes.js')
    help = require('./help.js')
    videolink = require("./videolink.js")
}
module.exports.yes = yes
module.exports.ping = ping
module.exports.help = help
module.exports.videolink = videolink**/