class Pile{
	
	constructor(type=PILE_GENERIC,faceUp=false,spread=false,player,noMovement=false){
		this.faceUp = faceUp;
		this.spread = spread;
		this.noMovement = noMovement;
		this.type = type;//PILE_DECK
		this.cards = [];
		this.player = player;
		this.pileClass = "player"+this.type;
		this.cardloadCache = [];
		
		if(this.player){
			game.piles[this.player.player][this.type] = this;
			
			this.addDropEvent();
			this.addAuxClickEvent();
		}
		
	}
	
	setPlayer(player){
		this.player = player;
		game.piles[this.player.player][this.type?this.type:"generic"] = this;
	}
	
	get showCount(){
		return this.cards.length>0&& (this.type==PILE_DECK || this.type==PILE_GRAVE || this.type==PILE_EXILE);
	}
	
	get $(){
		
		let sel = `.playerSide[player='${this.player.player}'] .${this.pileClass}`;

		return $(sel);
	}
	
	get topCard(){
		return this.cards[0];
	}
		
	moveCard(input,newIndex){
		//input can be an existing card, or an index		
		let card = this.getExistingCard(input);
		let oldIndex = this.cards.indexOf(card);
		newIndex = newIndex ? newIndex : 0;
		arrayMove(this.cards,oldIndex, newIndex);
	}
		
	addCard(input,newIndex){
		//input can be an existing card, or a card id
		//if it is a card id need to create a new card.
		//by default add to the bottom (highest index)
		let card = this.getOrCreateCard(input);
		this.cards.push(card);
		if(newIndex!=undefined){
			this.moveCard(card,newIndex);
		}
				
		card.pile = this;
		return card;
	}
	
	
	//cardsToLoad = [{name:name,quantity:quantity},]
	loadCards(cardsToLoad,cb){
		for(let i in cardsToLoad){
			for(let q = 0;q<cardsToLoad[i].quantity;q++){
				this.addCard({
					id : cardsToLoad[i].name,
					image : `https://battlespirits-saga.com/images/cards/card/${cardsToLoad[i].name}.png`
				})
			}
		}
		cb();
	}
	
	loadCardsFromAPI(cardsToLoad,index,cb){
		
		if(ISYUGIOHMODE){
			return this.loadYugiohCardsFromAPI(cardsToLoad,index,cb);
		}
		
		let payload = JSON.stringify({
			"identifiers": cardsToLoad,
		});
	
		let headers = {
			"Content-Type" : "application/json",
		}
		
		doRequest("https://api.scryfall.com/cards/collection","POST",payload,headers,(resp)=>{
			let allCardData = JSON.parse(resp).data;
			this.cardloadCache[index] = allCardData;
			
			if(cb){
				cb();
			}
			
		});
	}
	
	loadYugiohCardsFromAPI(cardsToLoad,index,cb){
console.log(cardsToLoad);
		let headers = {
			"Content-Type" : "application/json",
		}
		
		let cardIds = cardsToLoad.map((e)=>{return e.name}).join(",");
		
		doRequest("https://db.ygoprodeck.com/api/v7/cardinfo.php?id="+cardIds,"GET",{},headers,(resp)=>{
//console.log(resp);
			let allCardData = JSON.parse(resp).data;
			this.cardloadCache[index] = allCardData.map((e)=>{
				return {
					name : e.name,
					id : e.id,
					image_uris :{
						small : e.card_images[0].image_url_small,
						large : e.card_images[0].image_url,
					}
				}
			});
			
			if(cb){
				cb();
			}
			
		});
	}
	
	addLoadCards(cardsToLoad){
		let allCardData = [].concat(...this.cardloadCache);
console.log("allCardData",allCardData);
console.log("cardsToLoad",cardsToLoad);
		for(let card of cardsToLoad){
			let cardData = allCardData.find((e)=>{
				let names = e.name.split(/ \/\/ /g);
				return e.name ==card.name || names.indexOf(card.name)!=-1 ||e.id==card.name;
			});
			for(let i = 0;i<card.quantity;i++){
				this.addCard(cardData);
			}
		}
	}
	
	
	
	getOrCreateCard(input){
		//card id or card object to card object
		if(input instanceof Card){
			return input;
		}else{
			return new Card(input,this.player);
		}
	}
	
	getExistingCard(index){
		//card index or card object to card object
		if(index instanceof Card){
			return index;
		}else{
			return this.cards[index];
		}
	}
	
	removeCard(input){
		//input can be an existing card, or an index
		let index = input;
		if(input instanceof Card){
			index = this.cards.indexOf(input);
		}
		if(index==-1){
			return undefined;
		}
		return this.cards.splice(index,1)[0];
	}
	
	get order(){
		return this.cards.map((e)=>{
			return e.player==this.player? e.uidNumber:-e.uidNumber;
		});
	}
	
	shuffle(){
		this.cards = shuffle(this.cards);
		
		this.render();
		this.animateShuffle();
		game.dbClient.sendToOpponent({
			"action" : "Shuffle",
			"pile" : this.type,
			"player" : this.player.player,
			"order" : JSON.stringify(this.order),
		});
		
	}
	
	animateShuffle(){
		let elem = this.$.find(".cardImg");
		if(elem.length && (this.type==PILE_DECK ||this.type==PILE_HAND)){
			elem.css("transition-duration","0s").css("transform","rotate(0deg)");setTimeout(()=>{
				elem.css("transition-duration","1.5s").css("transform","rotate(360deg)");
			},0);
		}
	}
		
	setShuffle(order){
		this.cards.sort((a,b)=>{			
			let indexA = order.findIndex(getCardIndex(a,this.player));
			let indexB = order.findIndex(getCardIndex(b,this.player));
				
			return indexA-indexB;
		});
		this.render();
		this.animateShuffle();
	}
	
	untapAll(oppAction){
		for(let card of this.cards){
			card.tapped = false;
		}
		this.render();
		
		if(!oppAction){
			game.dbClient.sendToOpponent({
				"action" : "Untap All",
				"pile" : this.type,
				"player" : this.player.player,
			});
		}
	}
	
	empty(){
		for(let card of this.cards){
			if(card.scryPile==this){
				delete card.scryPile;
			}
			if(card.pile==this){
				delete card.pile;
			}
		}
		this.cards = [];
	}
	
	scry(num,oppAction){
		if(this.type!=PILE_DECK){
			return;
		}
		num = num?num:$("#scryNumber").val();
		if(num){
			let scryPile = new Pile(PILE_GENERIC,false,false,this.player);
			scryPile.cards = this.cards.slice(0,num);
			for(let card of scryPile.cards){
				card.scryPile = scryPile;
			}
			scryPile.viewPile();
			scryPile.parentPile = this;
			this.render();
		}
		
		if(!oppAction){
			game.dbClient.sendToOpponent({
				"action" : "Scry",
				"pile" : this.type,
				"player" : this.player.player,
				"number" : num,
				"reveal" : game.ui.scryShowOpponent,
			});
		}
		
	}
	
	reveal(){
		game.dbClient.sendToOpponent({
			"action" : "Reveal",
			"pile" : this.type,
			"player" : this.player.player,
		});
	}
	
	handleDrop(card){
		if(!game.isReplay){
			card.moveTo(this);
		}
	}
	
	addDropEvent(){		
	
		this.$.on('dragover', false).on('drop',(ev)=>{	
			let uid = ev.originalEvent.dataTransfer.getData("selectedCard");
			let card = game.cards[uid];
			if(!this.noMovement){
				this.handleDrop(card);
			}
			return false;
		});
		
		
	}	
	
	moveCores(){
		//select the other pile
		let pile = this.player.piles[this.type==PILE_RESERVE?"trash":"reserve"];
		
		this.topCard.moveCoresTo(pile.topCard);
	}
	
	addAuxClickEvent(){		
		this.$.on('auxclick', false).on('auxclick',(event)=>{	
if (event.which == 2) {//middle click
				this.untapAll();
			}else if (event.which == 3) {//right click
				this.viewPile();
			}
		});
	}
	
	render(){
		if(this.player){
			let output = TemplateEngine(pileTemplate,this);
			this.$.html(output);
			this.resizeCardsIfOverflow();
		}
		if(game.activePile==this){
			game.ui.renderViewPile(this);
		}
	}
	
	resizeCardsIfOverflow(){
		if(this.spread){//only resize on field, not in gy etc.
			if(this.$.prop('scrollHeight') > this.$.height()){
				this.$.find(".pile").addClass("overflownPile");
			}else{
				this.$.find(".pile").removeClass("overflownPile");
			}
		}
	}
	
	viewPile(){
		if(game.activePile){
			game.activePile.stopViewingPile();
		}
		game.activePile = this;
		this.render();
		//$("#pileDisplayModal").modal("show");
		$("[tabContent='#pileSidebarBox']").click();
		$("[tabContent='#pileSidebarBox'] > .fa").show();
		$("#stopViewingBtn").show();
		let colour = this.player==game.player1?game.player2.colour:game.player1.colour;
		game.dbClient.sendToOpponent({
			"action" : "Log",
			"log" : `Viewed ${highlight(this.player.player,colour)}s ${highlight(this.type,"coral")}`,
		});
		
	}
	
	stopViewingPile(){
		$("[tabContent='#pileSidebarBox'] > .fa").hide();
		$("#stopViewingBtn").hide();
		game.activePile = undefined;
		$("#viewPileContainer").html("");
		if(this.type==PILE_GENERIC){
			this.empty();
			this.parentPile.render();
			//delete this;
		}else{
			this.render();
		}
		
		let colour = this.player==game.player1?game.player2.colour:game.player1.colour;
		game.dbClient.sendToOpponent({
			"action" : "Log",
			"log" : `Stopped Viewing ${highlight(this.player.player,colour)}s ${highlight(this.type,"coral")}`,
		});
		
		if(this.type==PILE_DECK && game.ui.autoShuffle && !game.isReplay){
			this.shuffle();
		}
		
	}
	
}