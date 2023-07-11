class DBClient{

	constructor(username,password){
		this.version = 706;
		
		this.messageNumber = 0;
		
		this.heartBeatInterval = 30000;
		this.msgQueueInterval = 300;
		this.msgQueueLostTimeout = 1000; //change this timeout?
		
		this.maxMsgSize = 500;
		
		this.logItems = [];
		
		this.gameLog = [];//for building replays.
		
		this.username = username;
		this.rawPassword = password;
		
		
		this.msgQueue = [];//messages yet to be sent
		this.msgCache = {};//messages failed to sent, to be resent
		
		this.receivedMessagesToBeProcessed = {};//received messages, not yet processed.
		this.lastReceivedMessageID = 0;
		
		this.requestedGames = {};
		
		if(this.username && this.rawPassword){
			this.login();
		}
		
	}
	
	downloadReplay(){
		let str = JSON.stringify(this.gameLog);
		downloadFile("replay.mtg",str);
	}
	
	log(str,player){
		let log = {
			msg : str,
			player : player,
			time : new Date(),
		};
		
		this.logItems.push(log);
		
		game.ui.addLog(log);

	}
	
	relogin(){//cant use this due to unsafe header.
		let payload = { 
			db_id: this.db_id,
			version:this.version,
		};
		let formData= new URLSearchParams(payload).toString();
		let headers = {"Content-Type": "application/x-www-form-urlencoded"};
		doRequest("https://www.duelingbook.com/logged-in.php","POST",formData,headers,(resp)=>{
			this.processLogin(JSON.parse(resp));
		});
	}

	login(){
	
		let payload = { 
				username: this.username,
				password: this.rawPassword, 
				remember_me:1,
		};
		
		let formData= new URLSearchParams(payload).toString();
		
		let headers = {"Content-Type": "application/x-www-form-urlencoded"};
		
		doRequest("https://www.duelingbook.com/php-scripts/login-user.php","POST",formData,headers,(resp)=>{
			this.processLogin(JSON.parse(resp));
		});
	}
	
	processLogin(data){
		game.ui.loadingPartDone();

		if(data.message =="Invalid username"){
			game.ui.showInvalidPassword();
			return;
		}
		if(data.message =="Invalid password"){
			game.ui.showInvalidUsername();
			return;
		}
		
		
		let loginData = localStorage.getItem("loginData");
		loginData=loginData?JSON.parse(loginData):{};
		loginData[this.username] = this.rawPassword;
		localStorage.setItem("loginData",JSON.stringify(loginData));
		
		
		game.setup();

		this.password = data.password;
		this.username = data.username;
		
		game.player2.setName(this.username);
		
		this.connect();
	}
	
	
	send(data){
		this.lastSend = new Date();
		this.socket.send(JSON.stringify(data));
	}
	
	
	sendMessage(name,data){
		let message = {
			action:"Private message",
			message:JSON.stringify(data), 
			username:name
		};
		
		this.send(message);
	}
	
	sendQueuedMessage(name,data){
		let message = {
			action:"Private message",
			message:JSON.stringify(data), 
			username:name
		};
		
		this.msgQueue.push(data);
	}
	
	sendToOpponent(data){
		if(this.opponent){ 
			this.sendQueuedMessage(this.opponent,data);
		}
	}
	
	sendQueue(){
		if(this.msgQueue.length){
			
			this.messageNumber++; //this is the problem (?)
			
			let message = {
				action:"Private message",
				message:"", 
				username:this.opponent
			};
			
			let msgIndex;
			
			for(let i=0;i<this.msgQueue.length;i++){
				message.message = JSON.stringify({
					data : this.msgQueue.slice(0,i+1),
					msgId : this.messageNumber,
				});
				if(message.message.length > this.maxMsgSize){
					break;
				}else{
					msgIndex = i;
				}
			}
			message.message = JSON.stringify({
				data : this.msgQueue.slice(0,msgIndex+1),
				msgId : this.messageNumber,
			});
			this.msgQueue.splice(0,msgIndex+1);
			
			this.msgCache[this.messageNumber] = {
				msgId : this.messageNumber,
				msg : message,
				time : new Date(),
			}
			
			this.send(message);
		}
	}
	
	keepAlive(){
		this.send({"action":"Heartbeat"});
	}
	
	connect(){
		
		this.socket =  new WebSocket("wss://duel.duelingbook.com:8443/");
		
		this.socket.addEventListener('message', (event) => {
			let valid = false;
			for(let msgId in this.receivedMessagesToBeProcessed){
				let msg = this.receivedMessagesToBeProcessed[msgId];
				valid = this.onData(msg);
				if(!valid){
					break;
				}
			}
			this.onData(JSON.parse(event.data));
		});
		
		this.socket.onclose = (event)=>{
			game.ui.showMainMenu();
			alert("Error - Lost Connection");
		}
		
		this.socket.onerror = (event)=>{
			game.ui.showMainMenu();
			alert("Error - Lost Connection");
		}
		
		this.socket.onopen = (event)=>{
			this.keepAlive();
			setInterval(()=>{this.keepAlive()},this.heartBeatInterval);
			setInterval(()=>{
				if(!this.queueLostMessages()){
					this.sendQueue();
				}
			},this.msgQueueInterval);

			this.send({
				"action": "Connect",
				"username": this.username,
				"password": this.password,
				"db_id": "",
				"session": "",
				"administrate": false,
				"version": this.version,
				"capabilities": "",
				"remember_me": 1,
				"connect_time": 0,
				"fingerprint": 0,
				"html_client": true,
				"mobile": false,
				"browser": "Chrome",
				"platform": "PC",
				"degenerate": false,
				"revamped": true
			});
		}
	}
	
	
	sendDeck(deckType){
						
		let deck = deckType==PILE_DECK?game.player2.originalDeckList:game.player2.originalSideDeckList;
		
		deck = deck.map((e)=>{
			return {
				q:e.quantity,
				n:e.name,
			}
		});
		
		let startGamePayload = {
			action : "Start Game",
			deckType : deckType,
			deck : "",
			count : 0,
			order : 0,
			hasSide : game.player2.originalSideDeckList.length>0,
		};
		
		let firstCardIndex = 0;
		let lastCardIndex = 0;
		
		let messages = [];
		let prev = "";
		//limit is 500 characters.
		for(let i=0;i<deck.length;i++){
			startGamePayload.deck = JSON.stringify(deck.slice(firstCardIndex,i+1));
			
			let dummyMsg = {
				data : JSON.stringify([startGamePayload]),
				msgId : this.messageNumber,
			}
			
			if(JSON.stringify(dummyMsg).length > this.maxMsgSize){
				firstCardIndex = i;
				messages.push(prev);
				
				if(i==deck.length-1){
					startGamePayload.deck = JSON.stringify(deck.slice(firstCardIndex,i+1));
					messages.push(startGamePayload);
				}
				
			}else if(i==deck.length-1){
				messages.push(startGamePayload);
			}else{
				prev = clone(startGamePayload)
			}
		}
		
		for(let i in messages){
			messages[i].order = i;
			messages[i].count = messages.length;
			this.sendToOpponent(messages[i]);
		}
		
	}
	
	hostGame(opponentName){
		let message = {
			action : "Request Game",
		};
		
		//make sure this doesnt go through queue.
		this.sendMessage(opponentName,message);
	}
	
	
	connectOpponent(opponent){
		this.opponent = opponent;
		game.player1.setName(opponent);		
		
		game.ui.loading();
		
		this.sendDeck(PILE_DECK);
		this.sendDeck(PILE_SIDE);
		
	}

	confirmMessageSent(msgId){
		delete this.msgCache[msgId];
	}
	
	confirmMessageReceived(msgId){
		this.receivedMessages[msgId] = true;
	}
	
	queueLostMessages(){
		let msgsToSend = Object.values(this.msgCache);
		
		if(msgsToSend.length){
			if((msgsToSend[0].time.getTime() + this.msgQueueLostTimeout ) < new Date()){
				msgsToSend[0].time = new Date();
				this.send(msgsToSend[0].msg);
			}
			
		}
		
		return msgsToSend.length > 0;
	}

	processReceivedMessagesToBeProcessed(){
		
		for(let msg of this.receivedMessagesToBeProcessed){
			this.onData(msg);
		}
			
	}

	onData(msg){

		if(msg.action == "Connected"){
			game.ui.hideDeckBackButton();
			game.ui.showDeckForm();
		}else if(msg.action == "Lost connection"){
			console.log("Lost Connection");
		}else if(msg.action == "Private message"){

			let sender = msg.username;
			
			//for now just assume no one real will pm us.
			let allData = JSON.parse(msg.message);

			if(allData.action){
				//game setup
				return this.onGameMsg(allData,sender);
			}else{
				//message from opponent/you
				return this.onOpponentMsg(allData,sender,msg);
			}
	
		}
		return true;
	}
	
	onGameMsg(data,sender){
		
		if(sender==game.ui.opponent){
			if(data.action=="Accept Game"){
				game.ui.loadingPartDone();
				this.connectOpponent(sender);
				game.startGame();//maybe wait on this one?
			}else if(data.action=="Reject Game"){
				game.ui.loadingPartDone();
				//idk?
			} 
		}else if(sender!= this.username){
			if(data.action=="Request Game"){
				this.requestedGames[sender] = 1;//maybe put other details here, lobby name or something?
				game.ui.renderGameList();
			}
		}
		
		return true;
	}
	
	onOpponentMsg(allData,sender,msg){
		
		if(sender==this.username){				
			if(!this.msgCache[allData.msgId]){
				console.log("duplicate message sent",allData.msgId);
				return false;
			}else{
				console.log("confirm message sent",allData.msgId);
				this.confirmMessageSent(allData.msgId);
			}
		}
			
		if((!this.opponent ||sender==this.opponent )&& sender!=this.username && (this.lastReceivedMessageID + 1) != allData.msgId){
			if(allData.msgId <= this.lastReceivedMessageID){
				return false;
			}
			this.receivedMessagesToBeProcessed[allData.msgId] = msg;
			return false;
		}else{
			if(sender==this.opponent){
				delete this.receivedMessagesToBeProcessed[allData.msgId];
				this.lastReceivedMessageID = allData.msgId;
			}
			
			
			if(!this.opponent || (sender==this.opponent /*&& !this.receivedMessages[allData.msgId]*/) || sender==this.username){
				for(let data of allData.data){
					if(data.action=="Start Game"&&sender!=this.username&&!this.opponent){
						this.lastReceivedMessageID = allData.msgId;//fix for initial loading.
						this.connectOpponent(sender);//send them our decklist
						game.startGame();
					}
					
					if(sender==this.opponent){
						this.onMtgMsg(data,sender);
					}
					
					this.gameLog.push({data:data,sender:sender});//to build replays
					this.onMtgMsgLog(data,sender);
				}	
			}	
		}
		return true;
	}
	
	onMtgMsgLog(data,sender){
		let senderPlayer = game.getPlayer(sender);
		let logMsg = "";
		
		let playerHighlight = data.player?game.getPlayer(data.player).colour:game.player2.colour;
		
		let cardHighlight = "blue";
		let locationHighlight = "coral";
		
		if(data.action=="Start Game"){
			//logMsg = `Started the Game`
		}else if(data.action=="Move To"){
			let card = game.cards[data.uid];
			let vis = card.visible||(card.oldPile?card.oldPile.faceUp:false);
			if(card.cardData.name){
				logMsg = `Moved ${highlight(vis?card.cardData.name:"Unknown Card",cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],"+vis+")")} to ${highlight(data.player,playerHighlight)}s ${highlight(data.pile,locationHighlight)} from ${highlight(card.oldPile?card.oldPile.type:"Generic",locationHighlight)}`;
			}
		}else if(data.action=="Clone"){
			let card = game.cards[data.uid];		
			logMsg = `Cloned ${highlight(card.player.player,card.player.colour)}s ${highlight(card.cardData.name,cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],"+card.visible+")")}`;
		}else if(data.action=="Destroy"){
			let card = game.cards[data.uid];		
			logMsg = `Destroyed ${highlight(card.player.player,card.player.colour)}s ${highlight(card.cardData.name,cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],"+card.visible+")")}`;
		}else if(data.action=="Shuffle"){
			logMsg = `Shuffled ${highlight(data.player,playerHighlight)}s ${highlight(data.pile,locationHighlight)}`;
		}else if(data.action=="Reveal"){
			let pile = game.piles[data.player][data.pile];			
			logMsg = `Revealed ${highlight(data.player,playerHighlight)}s ${highlight(data.pile,locationHighlight)}`;
		}else if(data.action=="Scry"){
			logMsg = `Scried ${highlight(data.player,playerHighlight)}s ${highlight(data.pile,locationHighlight)} for ${data.number}`;
		}else if(data.action=="Untap All"){
			logMsg = `Untapped All in ${highlight(data.player,playerHighlight)}s ${highlight(data.pile,locationHighlight)}`;
		}else if(data.action=="Tapped"){
			let card = game.cards[data.uid];
			logMsg = `${data.tapped?"Tapped":"Untapped"} ${highlight(card.player.player,card.player.colour)}s ${highlight(card.cardData.name,cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],true)")} in ${highlight(card.pile.type,locationHighlight)}`;
		}else if(data.action=="Flip"){
			let card = game.cards[data.uid];
			if(card.visible){
				logMsg = `Flipped ${highlight(card.player.player,card.player.colour)}s ${highlight(card.cardData.name,cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],true)")} in ${highlight(data.pile,locationHighlight)}`;
			}
		}else if(data.action=="Counters"){
			let card = game.cards[data.uid];
			logMsg = `Set ${highlight(card.player.player,card.player.colour)}s ${highlight(card.cardData.name,cardHighlight,"game.ui.previewCard(game.cards['"+card.uid+"'],true)")} in ${highlight(card.pile.type,locationHighlight)} ${highlight("Counters",data.colour)} to ${data.counters}`;
			card.counters[data.colour] = data.counters;
			card.pile.render();
		}else if(data.action=="Set Life"){
			logMsg = `Set ${highlight(data.player,playerHighlight)}s Life to ${data.value}`;
		}else if(data.action=="Reset"){
			logMsg = `Reset ${highlight(data.player,playerHighlight)}s Deck`;
		}else if(data.action=="Log"){
			logMsg = data.log;
		}else if(data.action=="Coin"){
			logMsg = `Flipped a coin and Landed on ${highlight(data.result==1?"Heads":"Tails",locationHighlight)}`;
		}else if(data.action=="Dice"){
			logMsg = `Rolled a d${data.dice} and Landed on ${highlight(data.result,locationHighlight)}`;
		}
		
		if(logMsg){
			this.log(logMsg,senderPlayer);
		}
	}
	
	onMtgMsg(data,sender){
		let senderPlayer = game.getPlayer(sender);
		
		let targetPlayer = game.getPlayer(data.player);
		let targetCard = game.getCard(data.uid);
		let targetPile = game.getPile(data.player,data.pile);

		if(data.action=="Start Game"){

			let lines = JSON.parse(data.deck).map((e)=>{
				return {
					name : e.n,
					quantity : e.q,
				}
			});
			
			if(data.deckType==PILE_DECK){
				//maindeck
				senderPlayer.deckCache[data.order] = lines;
				senderPlayer.deckCacheCount = data.count;
				if(Object.keys(senderPlayer.deckCache).length == data.count){
					senderPlayer.originalDeckList = [].concat(...senderPlayer.deckCache);//todo.
				}						
			}else{
				//sidedeck
				senderPlayer.sideDeckCache[data.order] = lines;
				senderPlayer.sideDeckCacheCount = data.count;
				if(Object.keys(senderPlayer.sideDeckCache).length == data.count){
					senderPlayer.originalSideDeckList = [].concat(...senderPlayer.sideDeckCache);//todo.
				}
			}
			
			if(senderPlayer.originalDeckList.length && (senderPlayer.originalSideDeckList.length || !data.hasSide)){
				senderPlayer.loadDeck();
				game.ui.loadingPartDone();
			}
			
			

			$("#opponentForm").hide();
		}else if(data.action=="phase"){
			game.ui.phaseSelector.val(data.value)
		}else if(data.action=="Move To"){
			let index = data.index;
			let id = data.id;
			
			if(!targetCard){
				targetCard = new Card({id:id},targetPile.player);
				targetCard.loadCard(()=>{this.onMtgMsgLog(data,sender);});
			}
			
			targetCard.moveTo(targetPile,index,true);
			
		}else if(data.action=="Clone"){
			targetCard.clone(true);
		}else if(data.action=="Destroy"){
			targetCard.destroy(true);
		}else if(data.action=="Shuffle"){
			targetPile.setShuffle(JSON.parse(data.order));				
		}else if(data.action=="Reveal"){
			targetPile.viewPile();
		}else if(data.action=="Scry"){
			let number = data.number;
			let reveal = data.reveal;
			if(reveal){
				targetPile.scry(number,true);
			}
		}else if(data.action=="Untap All"){
			targetPile.untapAll(true);
		}else if(data.action=="Tapped"){
			targetCard.tapped = data.tapped;
			targetCard.pile.render();
		}else if(data.action=="Flip"){
			targetCard.face = data.face;
			targetCard.pile.render();
		}else if(data.action=="Counters"){
			targetCard.counters[data.colour] = data.counters;
			targetCard.pile.render();
		}else if(data.action=="Set Life"){
			let value = data.value;
			targetPlayer.setLife(value,true);
		}else if(data.action=="Reset"){
			targetPlayer.reset(true);
		}

	}
	
}