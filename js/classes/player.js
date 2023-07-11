class Player{

	constructor(player){
		this.player = player;
		
		this.cardUidCount = 1;
		this.life = 6;
		
		this.rawTxtDecklist = "";
		
		this.setUpField();
		
		game.piles[this.player] = {};
		game.players[this.player] = this;
		
		
		this.piles = {
			deck : new Pile(PILE_DECK,false,false,this),
			hand : new Pile(PILE_HAND,true,true,this),
			
			grave : new Pile(PILE_GRAVE,true,false,this),
			
			creatures : new Pile(PILE_CREATURES,true,true,this),
			lands : new Pile(PILE_LANDS,true,true,this),
			burst : new Pile(PILE_BURST,false,true,this),
			reserve : new Pile(PILE_RESERVE,true,true,this,true),
			trash : new Pile(PILE_TRASH,true,true,this,true),
			
			
			side : new Pile(PILE_SIDE,false,false,this),
		};
				
		this.deckCache = [];
		this.sideDeckCache = [];
		
		this.originalSideDeckList = [];
		this.originalDeckList = [];
		
	}

	loadDeck(cb){
		game.ui.loading();
		
		this.piles.deck.loadCards(this.originalDeckList,()=>{
			this.initCores();
			this.render();
			if(this.originalSideDeckList.length){
				this.piles.side.loadCards(this.originalSideDeckList,()=>{
					this.render();
					game.ui.loadingPartDone();
					if(typeof cb=="function"){
						cb();
					}
				});
			}else{
				game.ui.loadingPartDone();
				if(typeof cb=="function"){
					cb();
				}
			}
		});
	}
	
	emptyPiles(){
		this.cardUidCount = 1;
		for(let i in this.piles){
			this.piles[i].empty();
		}
	}
	
	initCores(){
		this.piles.trash.addCard({
			name : "trash",
			image : "./img/trash.png",
		});
		this.piles.reserve.addCard({
			name : "reserve",
			image : "./img/reserve.png",
		});
		this.piles.reserve.cards[0].incrementCounter("blue",3);
		this.piles.reserve.cards[0].incrementCounter("red",1);
	}
	
	reset(oppAction){
		this.life = 6;
		this.emptyPiles();
		this.loadDeck();
		this.render();
		
		if(!oppAction){
			game.dbClient.sendToOpponent({
				"action" : "Reset",
				"player" : this.player,
			});
		}
	}
	
	get $(){
		let sel = `.playerSide[player='${this.player}']`;
		return $(sel);
	}
	
	syncLife(){
		if(this.lifeTimer){
			clearTimeout(this.lifeTimer);
		}
		this.lifeTimer = setTimeout(()=>{
			let value = this.lifeDisplay.find(".playerLife").val();
			this.setLife(value);
		},500);
	}
	
	setLife(value,oppAction){
		this.life = Number(value);
		
		if(!oppAction){
			game.dbClient.sendToOpponent({
				"action" : "Set Life",
				"value" : this.life,
				"player" : this.player,
			});
		}else{
			this.lifeDisplay.find(".playerLife").val(this.life);
		}
	}
	
	setName(name){
		if(name!=this.player){
			this.lifeDisplay.find(".playerLifeLabel").text(name);
			game.piles[name] = game.piles[this.player];
			game.players[name] = this;
			this.$.attr("player",name);
			delete game.piles[this.player];
			delete game.players[this.player];
			this.player = name;
		}
	}
	
	setUpField(){
		game.ui.addField(this.player);
	}
	
	render(){
		for(let i in this.piles){
			this.piles[i].render();
		}
	}
}