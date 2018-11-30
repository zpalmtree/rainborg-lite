const config = require('./config');
const Discord = require('discord.js');
const request = require('request');

const client = new Discord.Client();

var tipPools = new Map();

client.on('ready', () => {
    console.log('Logged in');
});

client.on('error', console.error);

client.on('message', msg => {
    /* Don't do anything for bots */
    if (msg.author.bot) {
        return;
    }

    /* Add the user to the pool, if a valid channel and not blacklisted text */
    addToTipPool(msg);
    
    if (msg.content === config.prefix + 'balance') {
        balance(msg);
        return;
    }

    if (msg.content.startsWith(config.prefix + 'megatip')) {
        megatip(msg);
        return;
    }

    if (msg.content === config.prefix + 'dotip') {
        if (config.mods.includes(msg.author.id)) {
            if (!doTip(config.tipAmount)) {
                msg.reply('Failed to perform tip - possibly no users in the tip pool?');
            }
        } else {
            addReaction(config.prohibitedEmoji, msg);
        }
        return;
    }
});

launch();

function balance(msg) : void {
    /* 10 second timeout */
    request({uri: config.balanceURL, timeout: 10 * 1000}, function(error, response, body) {
        if (error) {
            console.error(error);
            msg.reply('Failed to get balance - possibly API is down?');
            return;
        }

        if (body !== undefined && body.balance !== undefined) {
            msg.reply(`Balance: ${body.balance}`);
        } else {
            msg.reply('Failed to get balance - possibly API is down?');
        }
    });
}

function megatip(msg) : void {
    if (config.mods.includes(msg.author.id)) {
        /* Remove the command to get out the amount */
        const megaTipStr = msg.content.replace(config.prefix + 'megatip', '');

        /* Check it's a number */
        if (isNaN(megaTipStr)) {
            msg.reply('Megatip amount is not an integer...');
            return;
        }

        /* Parse as a number */
        var megaTipAmount: number = Number(megaTipStr);

        if (megaTipAmount <= 0) {
            msg.reply('Megatip amount cannot be <= zero...');
            return;
        }

        if (!doTip(megaTipAmount)) {
            msg.reply('Failed to perform megatip - possibly no users in the tip pool?');
        } 
    } else {
        addReaction(config.prohibitedEmoji, msg);
    }
}

function addReaction(emoji: string, message) : void {
    /* Find the reaction */
    const reaction = message.guild.emojis.find(
        val => val.name == emoji
    );

    /* Couldn't find the reaction */
    if (!reaction) {
        console.error(`Failed to find emoji: ${emoji} on the server!`);
        return;
    }

    /* Add the reaction */
    message.react(reaction).catch(console.error);
}

function addToTipPool(msg) : void {
    if (!config.tipChannels.includes(msg.channel.id)) {
        console.log('Message in non tip channel, ignoring...');
        return;
    }

    for (var bannedPhrase of config.wordBlacklist) {
        if (msg.content.toLowerCase().includes(bannedPhrase)) {
            console.log(`Ignoring message (${msg.content}) containing banned ` +
                        `phrase: ${bannedPhrase}`);
            return;
        }
    }

    console.log(`Adding ${msg.author.username} to the tip pool...`);

    var channelPool = tipPools.get(msg.channel.id);

    /* Doesn't exist, add this entry and return */
    if (!channelPool) {
        tipPools.set(msg.channel.id, [msg.author.id]);
        return;
    }

    /* See if the user is already in the array */
    const index: number = channelPool.indexOf(msg.author.id);

    /* Item is the channel pool, remove it */
    if (index > -1) {
        channelPool.splice(index, 1);
    }

    /* If we're over the max capacity, remove the first item */
    if (channelPool.length > config.maxTippers) {
        channelPool.shift();
    }

    /* Finally add the new item onto the channel pool */
    channelPool.push(msg.author.id);

    /* And update the stored pools */
    tipPools.set(msg.channel.id, channelPool);
}

function doTip(amount: number) : boolean {
    var validChannels: any[] = [];

    /* Find any channels which have users in */
    for (var [channelID, users] of tipPools) {
        if (users.length > 0) {
            validChannels.push({'channelID': channelID, 'users': users});
        }
    }

    /* No-one available to tip */
    if (validChannels.length === 0) {
        console.log('No valid channels, not tipping...');
        return false;
    }

    /* Pick a random channel from the list */
    const chosenItem = validChannels[Math.floor(Math.random() * validChannels.length)];

    /* Find the channel object to send the message to */
    const channel = client.channels.find(val => val.id === chosenItem.channelID);

    if (!channel) {
        console.error('Could not find channel to tip!');
        return false;
    }

    /* Take the amount, divide by the amount of users we're sending to, and
       round to the correct amount of decimal places for the coin */
    const tipAmount: string = (amount / chosenItem.users.length).toFixed(config.decimals);

    /* Build the tip message */
    var message: string = `${config.tipCommand} ${tipAmount}`

    /* Mention each user we're tipping */
    for (var userID of chosenItem.users) {
        message += ` <@${userID}>`;
    }
    
    console.log(`Sending tip of amount ${tipAmount}`);

    channel.send(message);

    /* Empty the tip pools */
    tipPools = new Map();

    return true;
}

function launch() {
    /* Do a tip every tip frequency */
    var timer = setInterval(doTip, config.tipFrequency * 1000, config.tipAmount);

    client.login(config.token).catch((err) => { 
        /* Log the error */
        console.error(err);

        /* Cancel the tip thread */
        clearInterval(timer);

        /* Relaunch */
        launch();
    });
}
