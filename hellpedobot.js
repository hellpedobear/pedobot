class settings
  currentsong: {}
	users: {}
	djs: []
	mods: []
	host: []
	hasWarned: false
	currentwoots: 0
	currentmehs: 0
	currentcurates: 0
	roomUrlPath: null#for lock. 'dubstep-den' in 'http://plug.dj/dubstep-den/'
	internalWaitlist: []
	userDisconnectLog: []
	voteLog: {}
	seshOn: false
	forceSkip: false
	seshMembers: []
	launchTime: null
	totalVotingData:
		woots:0
		mehs:0
		curates:0
	pupScriptUrl: ''
	afkTime: 12*60*1000#Time without activity to be considered afk. 12 minutes in milliseconds
	songIntervalMessages: [
		{interval:15,offset:0,msg:"I'm a bot!"}
	]
	songCount: 0

	startup: =>
		@launchTime = new Date()
		@roomUrlPath = @getRoomUrlPath()

	getRoomUrlPath: =>
		window.location.pathname.replace(/\//g,'')

	newSong: ->
		@totalVotingData.woots += @currentwoots
		@totalVotingData.mehs += @currentmehs
		@totalVotingData.curates += @currentcurates

		@setInternalWaitlist()

		@currentsong = API.getMedia()
		if @currentsong != null
			return @currentsong
		else
			return false

	userJoin: (u)=>
		userIds = Object.keys(@users)
		if u.id in userIds
			@users[u.id].inRoom(true)
		else
			@users[u.id] = new User(u)
			@voteLog[u.id] = {}

	setInternalWaitlist: =>
		boothWaitlist = API.getDJs().slice(1)#remove current dj
		lineWaitList = API.getWaitList()
		fullWaitList = boothWaitlist.concat(lineWaitList)
		@internalWaitlist = fullWaitList

	activity: (obj) ->
		if(obj.type == 'message')
			@users[obj.fromID].updateActivity()

	startAfkInterval: =>
		@afkInterval = setInterval(afkCheck,2000)

	intervalMessages: =>
		@songCount++
		for msg in @songIntervalMessages
			if ((@songCount+msg['offset']) % msg['interval']) == 0
				API.sendChat msg['msg']

	implode: =>
		for item,val of @
			if(typeof @[item] == 'object') 
				delete @[item]
		clearInterval(@afkInterval)

	lockBooth: (callback=null)->
		$.ajax({
		    url: "http://plug.dj/_/gateway/room.update_options",
		    type: 'POST',
		    data: JSON.stringify({
		        service: "room.update_options",
		        body: [@roomUrlPath,{"boothLocked":true,"waitListEnabled":true,"maxPlays":1,"maxDJs":5}]
		    }),
		    async: this.async,
		    dataType: 'json',
		    contentType: 'application/json'
		}).done ->
			if callback?
				callback()

	unlockBooth: (callback=null)->
		$.ajax({
		    url: "http://plug.dj/_/gateway/room.update_options",
		    type: 'POST',
		    data: JSON.stringify({
		        service: "room.update_options",
		        body: [@roomUrlPath,{"boothLocked":false,"waitListEnabled":true,"maxPlays":1,"maxDJs":5}]
		    }),
		    async: this.async,
		    dataType: 'json',
		    contentType: 'application/json'
		}).done ->
			if callback?
				callback()


data = new settings()

class User

	afkWarningCount: 0#0:1 vez ausent vc sera notificado
	lastWarning: null
	protected: false #se continuar sera kikado.
	isInRoom: true#by BOT

	constructor: (@user)->
		@init()

	init: =>
		@lastActivity = new Date()

	updateActivity: =>
		@lastActivity = new Date()
		@afkWarningCount = 0
		@lastWarning = null

	getLastActivity: =>
		return @lastActivity

	getLastWarning: =>
		if @lastWarning == null
			return false
		else
			return @lastWarning

	getUser: =>
		return @user

	getWarningCount: =>
		return @afkWarningCount

	getIsDj: =>
		DJs = API.getDJs()
		for dj in DJs
			if @user.id == dj.id
				return true
		return false

	warn: =>
		@afkWarningCount++
		@lastWarning = new Date()

	notDj: =>
		@afkWarningCount = 0
		@lastWarning = null

	inRoom: (online)=>
		@isInRoom = online

	updateVote: (v)=>
		if @isInRoom
			data.voteLog[@user.id][data.currentsong.id] = v

class RoomHelper
	lookupUser: (username)->
		for id,u of data.users
			if u.getUser().username == username
				return u.getUser()
		return false

	userVoteRatio: (user)->
		songVotes = data.voteLog[user.id]
		votes = {
			'woot':0,
			'meh':0
		}
		for songId, vote of songVotes
			if vote == 1
				votes['woot']++
			else if vote == -1
				votes['meh']++
		votes['positiveRatio'] = (votes['woot'] / (votes['woot']+votes['meh'])).toFixed(2)
		votes

pupOnline = ->
	API.sendChat "Bot Online!"

populateUserData = ->
	users = API.getUsers()
	for u in users
		data.users[u.id] = new User(u)
		data.voteLog[u.id] = {}
	return

initEnvironment = ->
	document.getElementById("button-vote-positive").click()
	document.getElementById("button-sound").click()
	Playback.streamDisabled = true
	Playback.stop()

initialize = ->
  pupOnline()
  populateUserData()
  initEnvironment()
  initHooks()
  data.startup()
  data.newSong()
  data.startAfkInterval()

afkCheck = ->
  for id,user of data.users
    now = new Date()
    lastActivity = user.getLastActivity()
    timeSinceLastActivity = now.getTime() - lastActivity.getTime()
    if timeSinceLastActivity > data.afkTime #esteve inativo mais de limite de tempo afk
      if user.getIsDj()#if on stage
        secsLastActive = timeSinceLastActivity / 1000
        if user.getWarningCount() == 0
          user.warn()
          API.sendChat "@"+user.getUser().username+", Eu não vi você conversar ou votar em pelo menos 12 minutos. Você está AFK? Se você não mostrar a atividade em 2 minutos eu vou removê-lo."
        else if user.getWarningCount() == 1
          lastWarned = user.getLastWarning()#last time user was warned
          timeSinceLastWarning = now.getTime() - lastWarned.getTime()
          twoMinutes = 2*60*1000
          if timeSinceLastWarning > twoMinutes
            user.warn()
            warnMsg = "@"+user.getUser().username
            warnMsg += ", Eu não vi você conversar ou votar em pelo menos 14 minutos. Você está AFK? Se você não mostrar a atividade em 2 minutos eu vou removê-lo."
            API.sendChat warnMsg
        else if user.getWarningCount() == 2#Tempo para remover
          lastWarned = user.getLastWarning()#última vez que o usuário foi advertido
          timeSinceLastWarning = now.getTime() - lastWarned.getTime()
          oneMinute = 1*60*1000
          if timeSinceLastWarning > oneMinute
            DJs = API.getDJs()
            if DJs.length > 0 and DJs[0].id != user.getUser().id
              API.sendChat "@"+user.getUser().username+", você tinha duas advertências. Por favor, fique ativo por conversar ou votar."
              API.moderateRemoveDJ id
              user.warn()
      else
        user.notDj()

msToStr = (msTime) ->
  msg = ''
  timeAway = {'days':0,'hours':0,'minutes':0,'seconds':0}
  ms = {'day':24*60*60*1000,'hour':60*60*1000,'minute':60*1000,'second':1000}

  #split into days hours minutes and seconds
  if msTime > ms['day']
    timeAway['days'] = Math.floor msTime / ms['day']
    msTime = msTime % ms['day']
  if msTime > ms['hour']
    timeAway['hours'] = Math.floor msTime / ms['hour']
    msTime = msTime % ms['hour']
  if msTime > ms['minute']
    timeAway['minutes'] = Math.floor msTime / ms['minute']
    msTime = msTime % ms['minute']
  if msTime > ms['second']
    timeAway['seconds'] = Math.floor msTime / ms['second']

  #add non zero times
  if timeAway['days'] != 0
    msg += timeAway['days'].toString() + 'd'
  if timeAway['hours'] != 0
    msg += timeAway['hours'].toString() + 'h'
  if timeAway['minutes'] != 0
    msg += timeAway['minutes'].toString() + 'm'
  if timeAway['seconds'] != 0
    msg += timeAway['seconds'].toString() + 's'

  if msg != ''
    return msg
  else
    return false

class Command

	# Abstract of chat command
	# 	Required Attributes:
	# 		@parseType: How the chat message should be evaluated
	# 			- Options:
	# 				- 'exact' = chat message should exactly match command string
	# 				- 'startsWith' = substring from start of chat message to length
	# 					of command string should equal command string
	# 				- 'contains' = chat message contains command string
	# 		@command: String or Array of Strings that, when matched in message
	# 			corresponding with commandType, triggers bot functionality
	# 		@rankPrivelege: What user types are allowed to use this function
	# 			- Options:
	# 				- 'host' = only can be called by host
	#				- 'cohost' = can be called by hosts & co-hosts
	# 				- 'manager' or 'mod' = can be called by host, co-hosts, and managers
	#				- 'bouncer' = can be called by host, co-hosts, managers, and bouncers
	#				- 'featured' = can be called by host, co-hosts, managers, bouncers, and featured djs
	# 				- 'user' = can be called by all
	# 				- {'pointMin':min} = can be called by hosts and mods.  Users
	# 					can call if the # of points they have > pointMin
	# 		@functionality: actions bot will perform if conditions are satisfied
	# 			for chat command

	constructor: (@msgData) ->
		@init()

	init: ->
		@parseType=null
		@command=null
		@rankPrivelege=null

	functionality: (data)->
		return

	hasPrivelege: ->
		user = data.users[@msgData.fromID].getUser()
		switch @rankPrivelege
			when 'host'    then return user.permission is 5
			when 'cohost'  then return user.permission >=4
			when 'mod'     then return user.permission >=3
			when 'manager' then return user.permission >=3
			when 'bouncer' then return user.permission >=2
			when 'featured' then return user.permission >=1
			else return true

	commandMatch: ->
		msg = @msgData.message
		if(typeof @command == 'string')
			if(@parseType == 'exact')
				if(msg == @command)
					return true
				else
					return false
			else if(@parseType == 'startsWith')
				if(msg.substr(0,@command.length) == @command)
					return true
				else
					return false
			else if(@parseType == 'contains')
				if(msg.indexOf(@command) != -1)
					return true
				else
					return false
		else if(typeof @command == 'object')
			for command in @command
				if(@parseType == 'exact')
					if(msg == command)
						return true
				else if(@parseType == 'startsWith')
					if(msg.substr(0,command.length) == command)
						return true
				else if(@parseType == 'contains')
					if(msg.indexOf(command) != -1)
						return true
			return false

	evalMsg: ->
		if(@commandMatch() && @hasPrivelege())
			@functionality()
			return true
		else
			return false

class cookieCommand extends Command
	init: ->
		@command='cookie'
		@parseType='startsWith'
		@rankPrivelege='mod'

	getCookie: ->
		cookies = [
			"a chocolate chip cookie"
			"a sugar cookie"
			"an oatmeal raisin cookie"
			"a 'special' brownie"
			"an animal cracker"
			"a scooby snack"
			"a blueberry muffin"
			"a cupcake"
		]
		c = Math.floor Math.random()*cookies.length
		cookies[c]

	functionality: ->
		msg = @msgData.message
		r = new RoomHelper()
		if(msg.substring(7, 8) == "@") #Valid cookie argument including a username!
			user = r.lookupUser(msg.substr(8))
			if user == false
				API.sendChat "/em doesn't see '"+msg.substr(8)+"' in room and eats cookie himself"
				return false
			else
				API.sendChat "@"+user.username+", @"+@msgData.from+" has rewarded you with "+@getCookie()+". Enjoy."


class newSongsCommand extends Command
	init: ->
		@command='/novasmusicas'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		mChans = @memberChannels.slice(0)
		chans = @channels.slice(0)#shallow copies
		arts = @artists.slice(0)
		#list local so lists don't shrink as function is called over time
		chooseRandom= (list)->
			l = list.length
			r = Math.floor Math.random()*l
			return list.splice(r,1)

		selections =
			channels : [],
			artist : ''
		u = data.users[@msgData.fromID].getUser().username
		if(u.indexOf("MistaDubstep") != -1)
			selections['channels'].push 'MistaDubstep'
		else if(u.indexOf("Underground Promotions") != -1)
			selections['channels'].push 'UndergroundDubstep'
		else
			selections['channels'].push chooseRandom mChans	
		selections['channels'].push chooseRandom chans
		selections['channels'].push chooseRandom chans

		cMedia = API.getMedia()
		if cMedia? and cMedia.author in arts
			selections['artist'] = cMedia.author
		else
			selections['artist'] = chooseRandom arts

		msg = "Everyone's heard that " + selections['artist'] +
		" track! Get new music from http://youtube.com/" + selections['channels'][0] +
		" http://youtube.com/" + selections['channels'][1] + 
		" or http://youtube.com/" + selections['channels'][2];

		API.sendChat(msg)

	# memChanLen = memberChannels.length
 #      chanLen = channels.length
 #      artistsLen = artists.length
 #      mc1 = Math.floor(Math.random() * memChanLen)
 #      mchan1 = memberChannels.splice(mc1, 1)
 #      mc2 = Math.floor(Math.random() * memChanLen - 1)
 #      mchan2 = memberChannels.splice(mc2, 1)
 #      c1 = Math.floor(Math.random() * (chanLen))
 #      chan = channels.splice(c1, 1)
 #      a1 = Math.floor(Math.random() * artistsLen)
 #      API.sendChat "Everyone's heard that " + artists[a1] + " track! Get new music from http://youtube.com/" + mchan1 + " http://youtube.com/" + mchan2 + " or http://youtube.com/" + chan

	memberChannels: [
		"JitterStep",
		"MistaDubstep",
		"DubStationPromotions",
		"UndergroundDubstep",
		"JesusDied4Dubstep",
		"DarkstepWarrior",
		"BombshockDubstep",
		"Sharestep"
	]
	channels: [
		"BassRape",
		"Mudstep",
		"WobbleCraftDubz",
		"MonstercatMedia",
		"UKFdubstep",
		"DropThatBassline",
		"Dubstep",
		"VitalDubstep",
		"AirwaveDubstepTV",
		"EpicNetworkMusic",
		"NoOffenseDubstep",
		"InspectorDubplate",
		"ReptileDubstep",
		"MrMoMDubstep",
		"FrixionNetwork",
		"IcyDubstep",
		"DubstepWeed",
		"VhileMusic",
		"LessThan3Dubstep",
		"PleaseMindTheDUBstep",
		"ClownDubstep",
		"TheULTRADUBSTEP",
		"DuBM0nkeyz",
		"DubNationUK",
		"TehDubstepChannel",
		"BassDropMedia",
		"USdubstep",
		"UNITEDubstep" 
	]
	artists: [
		"Skrillex",
		"Doctor P",
		"Excision",
		"Flux Pavilion",
		"Knife Party",
		"Krewella",
		"Rusko",
		"Bassnectar",
		"Nero",
		"Deadmau5"
		"Borgore"
		"Zomboy"
	]


class whyWootCommand extends Command
	init: ->
		@command='/pqvotar'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		msg = "We dislike AFK djs. We calculate your AFK status by checking the last time you
			Woot'd or spoke. If you don't woot, I'll automagically remove you. Use our AutoWoot
			script to avoid being removed: http://bit.ly/McZdWw"

		if((nameIndex = @msgData.message.indexOf('@')) != -1)
			API.sendChat @msgData.message.substr(nameIndex) + ', ' + msg
		else
			API.sendChat msg

class themeCommand extends Command
	init: ->
		@command='/tema'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		msg = "Estilos permitidos : ELETRONICA , DUBSTEP , DRUM STEP , RAP , VIDEOS DE HUMOR "
		msg += "Hardstyle, Rock, House, e Trance!!"
		API.sendChat(msg)


class rulesCommand extends Command
	init: ->
		@command='/regras'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		msg = "1) Toque musicas com qualidade. "
		msg += "2) nao repita a mesma musica. 3) musicas com no maximo 8 minutos. "
		msg += "4) Respeita os ADMS e as pessoas da sala ! Respeie a musica dos outros DJ!"
		API.sendChat(msg)



class roomHelpCommand extends Command
	init: ->
		@command='/ajuda'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		msg1 = "Bem vindo! Para ser o DJ, Criar uma lista de reprodução e coloque Musica do Youtube ou soundcloud.  "
		msg1+= "Se é novo procure pelo seu nome na sua tela (do lado da cabine de dj e clique) e depois mude o nome."

		msg2 = "Para Ganhar Pontos é có clica em Bacana ou Chato.   "
		msg2+= "Digite /regras pare ler as regras."
		API.sendChat(msg1)
		setTimeout (-> API.sendChat msg2), 750



class sourceCommand extends Command
	init: ->
		@command=['/source', '/sourcecode', '/author']
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		msg = 'Backus wrote me in CoffeeScript.  A generalized version of me should be available on github soon!'
		API.sendChat msg

class wootCommand extends Command
	init: ->
		@command='/votar'
		@parseType='startsWith'
		@rankPrivelege='user'

	functionality: ->
		msg = "VOCE PODE TER O BOT DE VOTAR SOZINHO DOWNLOAD  http://bit.ly/Lwcis0"
		if((nameIndex = @msgData.message.indexOf('@')) != -1)
			API.sendChat @msgData.message.substr(nameIndex) + ', ' + msg
		else
			API.sendChat msg

class badQualityCommand extends Command
	init: ->
		@command='.128'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		msg = "Marcado por má qualidade de som. De onde você tira sua música? A lata de lixo? Não jogue esta música de baixa qualidade de novo!"
		API.sendChat msg

class downloadCommand extends Command
	init: ->
		@command='/download'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		return if !data.currentsong? # no song
		e = encodeURIComponent
		eAuthor = e(data.currentsong.author)
		eTitle = e(data.currentsong.title)
		msg ="Tente este link para BAIXAR DE ALTA QUALIDADE: http://google.com/#hl=en&q="
		msg+=eAuthor + "%20-%20" + eTitle
		msg+="%20site%3Azippyshare.com%20OR%20site%3Asoundowl.com%20OR%20site%3Ahulkshare.com%20OR%20site%3Asoundcloud.com"

		API.sendChat(msg)



class afksCommand extends Command
	init: ->
		@command='/ausentes'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		msg = ''
		djs = API.getDJs() 
		for dj in djs
			now = new Date()
			djAfk = now.getTime() - data.users[dj.id].getLastActivity().getTime()
			if djAfk > (5*60*1000)#Ausentes mais que 5 minutos
				#creat afk string
				if msToStr(djAfk) != false
					msg += dj.username + ' - ' + msToStr(djAfk)
					msg += '. '

		if msg == ''
			API.sendChat "Não tem ninguem ausente."
		else
			API.sendChat 'AFKs: ' + msg

class allAfksCommand extends Command
	init: ->
		@command='/todosafks'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		msg = ''
		usrs = API.getUsers() 
		for u in usrs
			now = new Date()
			uAfk = now.getTime() - data.users[u.id].getLastActivity().getTime()
			if uAfk > (10*60*1000)#Ausentes mais que 10 minutos
				#creat afk string
				if msToStr(uAfk) != false
					msg += u.username + ' - ' + msToStr(uAfk)
					msg += '. '

		if msg == ''
			API.sendChat "Não tem ninguem ausente"
		else
			API.sendChat 'AFKs: ' + msg

class statusCommand extends Command
	init: ->
		@command='/status'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		lt = data.launchTime
		month = lt.getMonth()+1
		day = lt.getDate()
		hour = lt.getHours()
		meridian = if (hour % 12 == hour) then 'AM' else 'PM'
		min = lt.getMinutes()
		min = if (min < 10) then '0'+min else min

		t = data.totalVotingData
		t['songs'] = data.songCount

		launch = 'Initiated ' + month + '/' + day + ' ' + hour + ':' + min + ' ' + meridian + '. '
		totals = '' + t.songs + ' songs have been played, accumulating ' + t.woots + ' woots, ' + t.mehs + ' mehs, and ' + t.curates + ' queues.'

		msg = launch + totals

		API.sendChat msg

class unhookCommand extends Command
	init: ->
		@command='/desengatar todos eventos'
		@parseType='exact'
		@rankPrivelege='host'

	functionality: ->
		API.sendChat 'Fexando todos eventos.'
		undoHooks()



class dieCommand extends Command
	init: ->
		@command='/desativar'
		@parseType='exact'
		@rankPrivelege='host'

	functionality: ->
		API.sendChat 'Desativando bot'
		undoHooks()
		API.sendChat '3 , 2 , 1 ...'
		data.implode()
		API.sendChat 'ALS Bot desativado'


class reloadCommand extends Command
	init: ->
		@command='/recarregar'
		@parseType='exact'
		@rankPrivelege='host'

	functionality: ->
		API.sendChat 'brb'
		undoHooks()
		pupSrc = data.pupScriptUrl
		data.implode()
		$.getScript(pupSrc)

class lockCommand extends Command
	init: ->
		@command='/travar'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		API.sendChat 'Bloqueou a cabine de DJ'
		data.lockBooth()


class unlockCommand extends Command
	init: ->
		@command='/destravar'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		API.sendChat 'Desbloqueio a cabine de DJ'
		data.unlockBooth()


class swapCommand extends Command
	init: ->
		@command='/swap'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		msg = @msgData.message
		swapRegex = new RegExp("^/swap @(.+) for @(.+)$")
		users = swapRegex.exec(msg).slice(1)
		r = new RoomHelper()
		if users.length == 2
			userRemove = r.lookupUser users[0]
			userAdd = r.lookupUser users[1]
			if userRemove == false or userAdd == false
				API.sendChat 'Error parsing one or both names'
				return false
			else
				data.lockBooth(->
					API.moderateRemoveDJ userRemove.id
					API.sendChat "Removing " + userRemove.username + "..."
					setTimeout(->
						API.moderateAddDJ userAdd.id
						API.sendChat "Adding " + userAdd.username + "..."
						setTimeout(->
							data.unlockBooth()
						,1500)
					,1500)
				)
		else
			API.sendChat "Command didn't parse into two seperate usernames"

class popCommand extends Command
	init: ->
		@command='/pop'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		djs = API.getDJs()
		popDj = djs[djs.length-1]
		API.moderateRemoveDJ(popDj.id)

class pushCommand extends Command
	init: ->
		@command='/pular'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		msg = @msgData.message
		if msg.length>@command.length+2#'/push @'
			name = msg.substr(@command.length+2)
			r = new RoomHelper()
			user = r.lookupUser(name)
			if user != false
				API.moderateAddDJ user.id

class resetAfkCommand extends Command
	init: ->
		@command='/resetafk'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		if @msgData.message.length > 10
			name = @msgData.message.substring(11)#remove @
			for id,u of data.users
				if u.getUser().username == name
					u.updateActivity()
					API.sendChat '@' + u.getUser().username + '\'s AFK tempo foi resetado.'
					return
			API.sendChat 'Nao tenho certeza que ' + name + ' esta'
			return
		else
			API.sendChat 'Me de um nome retardado'
			return

class forceSkipCommand extends Command
	init: ->
		@command='/forceskip'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		msg = @msgData.message
		if msg.length > 11 #command switch included
			param = msg.substr(11)
			if param == 'enable'
				data.forceSkip = true
				API.sendChat "Forçar salto Ativado ."
			else if param == 'disable'
				data.forceSkip = false
				API.sendChat "Forçar Salto desativado."


class overplayedCommand extends Command
	init: ->
		@command='/none'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		API.sendChat "View the list of songs we consider overplayed and suggest additions at http://den.johnback.us/overplayed_tracks"



class uservoiceCommand extends Command
	init: ->
		@command=['/uservoice','/idea']
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		msg = 'Have an idea for the room, our bot, or an event?  Awesome! Submit it to our uservoice and we\'ll get started on it: http://is.gd/IzP4bA'
		msg += ' (please don\'t ask for mod)'
		API.sendChat(msg)


class skipCommand extends Command
	init: ->
		@command='/saltar'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		API.moderateForceSkip()



class whyMehCommand extends Command
	init: ->
		@command='/none1'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		msg = "Reserve Mehs for songs that are a) extremely overplayed b) off genre c) absolutely god awful or d) troll songs. "
		msg += "If you simply aren't feeling a song, then remain neutral"
		API.sendChat msg

class commandsCommand extends Command
	init: ->
		@command='/none3'
		@parseType='exact'
		@rankPrivelege='user'

	functionality: ->
		allowedUserLevels = []
		user = API.getUser(@msgData.fromID)
		if user.owner
			allowedUserLevels = ['user','mod','host']
		else if user.moderator
			allowedUserLevels = ['user','mod']
		else
			allowedUserLevels = ['user']
		msg = ''
		for cmd in cmds
			c = new cmd('')
			if c.rankPrivelege in allowedUserLevels
				if typeof c.command == "string"
					msg += c.command + ', '
				else if typeof c.command == "object"
					for cc in c.command
						msg += cc + ', '
		msg = msg.substring(0,msg.length-2)
		API.sendChat msg



class disconnectLookupCommand extends Command
	init: ->
		@command='/dclookup'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		cmd = @msgData.message
		if cmd.length > 11#includes name
			givenName = cmd.slice(11)
			for id,u of data.users
				if u.getUser().username == givenName
					dcLookupId = id
					disconnectInstances = []
					for dcUser in data.userDisconnectLog
						if dcUser.id == dcLookupId
							disconnectInstances.push(dcUser)
					if disconnectInstances.length > 0
						resp = u.getUser().username + ' has disconnected ' + disconnectInstances.length.toString() + ' time'
						if disconnectInstances.length == 1#lol plurals
							resp += '. '
						else
							resp += 's. '
						recentDisconnect = disconnectInstances.pop()
						dcHour = recentDisconnect.time.getHours()
						dcMins = recentDisconnect.time.getMinutes()
						if dcMins < 10
							dcMins = '0' + dcMins.toString()
						dcMeridian = if (dcHour % 12 == dcHour) then 'AM' else 'PM'
						dcTimeStr = ''+dcHour+':'+dcMins+' '+dcMeridian
						dcSongsAgo = data.songCount - recentDisconnect.songCount
						resp += 'Their most recent disconnect was at ' + dcTimeStr + ' (' + dcSongsAgo + ' songs ago). '

						if recentDisconnect.waitlistPosition != undefined
							resp += 'They were ' + recentDisconnect.waitlistPosition + ' song'
							if recentDisconnect.waitlistPosition > 1#lol plural
								resp += 's'
							resp += ' away from the DJ booth.'
						else
							resp += 'They were not on the waitlist.'
						API.sendChat resp
						return
					else
						API.sendChat "I haven't seen " + u.getUser().username + " disconnect."
						return
			API.sendChat "I don't see a user in the room named '"+givenName+"'."

class voteRatioCommand extends Command
	init: ->
		@command='/voteratio'
		@parseType='startsWith'
		@rankPrivelege='mod'

	functionality: ->
		r = new RoomHelper()
		msg = @msgData.message
		if msg.length > 12 #includes username
			name = msg.substr(12)
			u = r.lookupUser(name)
			if u != false
				votes = r.userVoteRatio(u)
				msg = u.username + " has wooted "+votes['woot'].toString()+" time"
				if votes['woot'] == 1
					msg+=', '
				else
					msg+='s, '
				msg += "and meh'd "+votes['meh'].toString()+" time"
				if votes['meh'] == 1
					msg+='. '
				else
					msg+='s. '
				msg+="Their woot:vote ratio is " + votes['positiveRatio'].toString() + "."
				API.sendChat msg
			else
				API.sendChat "I don't recognize a user named '"+name+"'"
		else
			API.sendChat "I'm not sure what you want from me..."



class avgVoteRatioCommand extends Command
	init: ->
		@command='/avgvoteratio'
		@parseType='exact'
		@rankPrivelege='mod'

	functionality: ->
		roomRatios = []
		r = new RoomHelper()
		for uid, votes of data.voteLog
			user = data.users[uid].getUser()
			userRatio = r.userVoteRatio(user)
			roomRatios.push userRatio['positiveRatio']
		averageRatio = 0.0
		for ratio in roomRatios
			averageRatio+=ratio
		averageRatio = averageRatio / roomRatios.length
		msg = "Accounting for " + roomRatios.length.toString() + " user ratios, the average room ratio is " + averageRatio.toFixed(2).toString() + "."
		API.sendChat msg



cmds = [
	cookieCommand,
	newSongsCommand,
	whyWootCommand,
	themeCommand,
	rulesCommand,
	roomHelpCommand,
	sourceCommand,
	wootCommand,
	badQualityCommand,
	downloadCommand,
	afksCommand,
	allAfksCommand,
	statusCommand,
	unhookCommand,
	dieCommand,
	reloadCommand,
	lockCommand,
	unlockCommand,
	swapCommand,
	popCommand,
	pushCommand,
	overplayedCommand,
	uservoiceCommand,
	whyMehCommand,
	skipCommand,
	commandsCommand,
	resetAfkCommand,
	forceSkipCommand,
	disconnectLookupCommand,
	voteRatioCommand,
	avgVoteRatioCommand
]

chatCommandDispatcher = (chat)->
    chatUniversals(chat)
    for cmd in cmds
    	c = new cmd(chat)
    	if c.evalMsg()
    		break


updateVotes = (obj) ->
    data.currentwoots = obj.positive
    data.currentmehs = obj.negative
    data.currentcurates = obj.curates

announceCurate = (obj) ->
    API.sendChat "/em: " + obj.user.username + " loves this song!"

handleUserJoin = (user) ->
    data.userJoin(user)
    data.users[user.id].updateActivity()
    API.sendChat "/em: " + user.username + " has joined the Room!"

handleNewSong = (obj) ->
    data.intervalMessages()
    if(data.currentsong == null)
        data.newSong()#first song since launch
    else
        API.sendChat "/em: Just played " + data.currentsong.title + " by " + data.currentsong.author + ". Stats: Woots: " + data.currentwoots + ", Mehs: " + data.currentmehs + ", Loves: " + data.currentcurates + "."
        data.newSong()
        document.getElementById("button-vote-positive").click()
    if data.forceSkip # skip songs when song is over
        songId = obj.media.id
        setTimeout ->
            cMedia = API.getMedia()
            if cMedia.id == songId
                API.moderateForceSkip()
        ,(obj.media.duration * 1000)

handleVote = (obj) ->
    data.users[obj.user.id].updateActivity()
    data.users[obj.user.id].updateVote(obj.vote)

handleUserLeave = (user)->
    disconnectStats = {
        id : user.id
        time : new Date()
        songCount : data.songCount
    }
    i=0
    for u in data.internalWaitlist
        if u.id == user.id
            disconnectStats['waitlistPosition'] = i-1#0th position -> 1 song away
            data.setInternalWaitlist()#reload waitlist now that someone left
            break
        else
            i++
    data.userDisconnectLog.push(disconnectStats)
    data.users[user.id].inRoom(false)

antispam = (chat)->
    #test if message contains plug.dj room link
    plugRoomLinkPatt = /(\bhttps?:\/\/(www.)?plug\.dj[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig
    if(plugRoomLinkPatt.exec(chat.message))
        #plug spam detected
        sender = API.getUser chat.fromID
        if(!sender.ambassador and !sender.moderator and !sender.owner and !sender.superuser)
            if !data.users[chat.fromID].protected
                API.sendChat "Don't spam room links you ass clown"
                API.moderateDeleteChat chat.chatID
            else
                API.sendChat "I'm supposed to kick you, but you're just too darn pretty."

beggar = (chat)->
    msg = chat.message.toLowerCase()
    responses = [
        "Good idea @{beggar}!  Don't earn your fans or anything thats so yesterday"
        "Guys @{beggar} asked us to fan him!  Lets all totally do it! ಠ_ಠ"
        "srsly @{beggar}? ಠ_ಠ"
        "@{beggar}.  Earning his fans the good old fashioned way.  Hard work and elbow grease.  A true american."
    ]
    r = Math.floor Math.random()*responses.length
    if msg.indexOf('fan me') != -1 or msg.indexOf('fan for fan') != -1 or msg.indexOf('fan pls') != -1 or msg.indexOf('fan4fan') != -1 or msg.indexOf('add me to fan') != -1
        API.sendChat responses[r].replace("{beggar}",chat.from)

chatUniversals = (chat)->
    data.activity(chat)
    antispam(chat)
    beggar(chat)

hook = (apiEvent,callback) ->
    API.addEventListener(apiEvent,callback)

unhook = (apiEvent,callback) ->
    API.removeEventListener(apiEvent,callback)

apiHooks = [
    {'event':API.ROOM_SCORE_UPDATE, 'callback':updateVotes},
    {'event':API.CURATE_UPDATE, 'callback':announceCurate},
    {'event':API.USER_JOIN, 'callback':handleUserJoin},
    {'event':API.DJ_ADVANCE, 'callback':handleNewSong},
    {'event':API.VOTE_UPDATE, 'callback':handleVote},
    {'event':API.CHAT, 'callback':chatCommandDispatcher},
    {'event':API.USER_LEAVE, 'callback':handleUserLeave}
]

initHooks = ->
	hook pair['event'], pair['callback'] for pair in apiHooks

undoHooks = ->
    unhook pair['event'], pair['callback'] for pair in apiHooks

initialize()
