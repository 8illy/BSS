function arrayMove(arr,from, to) {
	arr.splice(to, 0, arr.splice(from, 1)[0]);
};

function parseDeckLine(e){
	let parts = e.split(" ");
	return {
		quantity : Number(parts.shift()),
		name : parts.join(" "),	
	}
}

function filterEmpty(e){
	return !!e && e.trim().length > 0;
}

function filterUnique(e,i,a){
	return a.indexOf(e)==i;
}

function dragCard(ev) {
	let uid  = ev.target.getAttribute("uid");
	ev.dataTransfer.setData("selectedCard", uid);
}

function chunk (arr, len) {

  var chunks = [],
      i = 0,
      n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i += len));
  }

  return chunks;
}

function doRequest(url,method="GET",payload={},headers={},callback=console.log){
	let xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
		if (this.readyState == 4) {
			
			callback(this.responseText);
		}
	};
	xhr.open(method, url, true);
	for(let i in headers){
		xhr.setRequestHeader(i, headers[i]);
	}
	xhr.send(payload);
}

function TemplateEngine(template, options) {
	
	let re = /<%([^%>]+)?%>/g, reExp = /(^( )?(if|for|else|switch|case|break|{|}))(.*)?/g, code = 'var r=[];\n', cursor = 0, match;
	let add = function(line, js) {
		js? (code += line.match(reExp) ? line + '\n' : 'r.push(' + line + ');\n') :
			(code += line != '' ? 'r.push("' + line.replace(/"/g, '\\"') + '");\n' : '');
		return add;
	}
	while(match = re.exec(template)) {
		add(template.slice(cursor, match.index))(match[1], true);
		cursor = match.index + match[0].length;
	}
	add(template.substr(cursor, template.length - cursor));
	code += 'return r.join("");';
	return new Function(code.replace(/[\r\t\n]/g, '')).apply(options);
}

function shuffle(array,start,end) {
	
	start = start?start:0;
	start = Math.max(0,start);
	
	end = end?end:array.length
	end = Math.min(array.length,end);
	
	let currentIndex = end;//array.length;
	let temporaryValue;
	let randomIndex;

	// While there remain elements to shuffle...
	while (start !== currentIndex) {

		// Pick a remaining element...
		randomIndex = start + (Math.floor(Math.random() * (end - start)));
		currentIndex -= 1;
		
		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

  return array;
}



function clone(arr){
	return JSON.parse(JSON.stringify(arr));
}

function getCardIndex(a,player){
	return (e)=>{
		let uid = e;
		if(uid<0){
			uid = uid*-1;
		}
		return uid==a.uidNumber && ( (e<0 && a.player!=player)||(e>0 && a.player==player));
	}
}


function highlight(str,colour,action){
	colour=colour?colour:"red";
	return TemplateEngine(`<span style="color:${colour}" onmouseover="${action}"><%this%></span>`,str);
}

function downloadFile(fileName,fileContent) {
	
	let file = new File([fileContent], fileName, {
		type: 'text/plain',
	})

	let link = document.createElement('a')
	let url = URL.createObjectURL(file)

	link.href = url
	link.download = file.name
	document.body.appendChild(link)
	link.click()

	document.body.removeChild(link)
	window.URL.revokeObjectURL(url)
}