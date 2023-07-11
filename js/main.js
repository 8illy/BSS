$(document).ready(()=>{
	window.addEventListener("contextmenu", (e) => {e.preventDefault()});
	window.addEventListener("mousedown", (e)=>{ if(e.button == 1){ e.preventDefault(); } });
	
	game = new Game();
	
});