var R=Object.defineProperty;var W=(t,e,s)=>e in t?R(t,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):t[e]=s;var p=(t,e,s)=>W(t,typeof e!="symbol"?e+"":e,s);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))o(n);new MutationObserver(n=>{for(const a of n)if(a.type==="childList")for(const c of a.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&o(c)}).observe(document,{childList:!0,subtree:!0});function s(n){const a={};return n.integrity&&(a.integrity=n.integrity),n.referrerPolicy&&(a.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?a.credentials="include":n.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function o(n){if(n.ep)return;n.ep=!0;const a=s(n);fetch(n.href,a)}})();const r={page:"home",nickname:"",playerId:"",roomId:"",isOwner:!1,players:[],totalRounds:0,wordOptions:[],wordHint:"",secondsLeft:0,guessedPlayers:new Set,isDrawing:!1,roundScores:[],rankings:[]},_=[];function i(t){Object.assign(r,t),_.forEach(e=>e(r))}function O(t){_.push(t)}const w=new Map;let u=null;function $(t){const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/ws/${t}`;return u=new WebSocket(s),new Promise((o,n)=>{u.onopen=()=>{y({type:"join_room",data:{nickname:r.nickname}}),o()},u.onerror=()=>n(new Error("WebSocket connection failed")),u.onmessage=a=>{const c=JSON.parse(a.data),B=w.get(c.type);B&&B(c.data);const L=w.get("*");L&&L(c)}})}function y(t){(u==null?void 0:u.readyState)===WebSocket.OPEN&&u.send(JSON.stringify(t))}function d(t,e){w.set(t,e)}const A=document.getElementById("app");A.insertAdjacentHTML("beforeend",`
<div id="page-home" class="flex-center" style="min-height:100vh;">
  <div class="flex-col gap-16 text-center" style="max-width:360px;width:100%;">
    <div>
      <h1 style="font-size:32px;margin-bottom:4px;">🎨 你画我猜</h1>
      <p class="text-muted">和朋友一起画画猜词</p>
    </div>

    <div class="flex-col gap-8">
      <label class="text-sm" style="text-align:left;">你的昵称</label>
      <input id="nickname-input" type="text" placeholder="输入昵称..." maxlength="12" />
    </div>

    <div class="flex-col gap-8">
      <button id="btn-create" style="width:100%;">✨ 创建房间</button>
      <div style="display:flex;gap:0;">
        <input id="room-code-input" type="text" placeholder="房间号" maxlength="4"
          style="border-radius:var(--radius) 0 0 var(--radius);text-transform:uppercase;" />
        <button id="btn-join" style="border-radius:0 var(--radius) var(--radius) 0;white-space:nowrap;">加入</button>
      </div>
    </div>

    <p id="home-error" class="text-sm" style="color:var(--danger);display:none;"></p>
  </div>
</div>
`);const T=document.getElementById("nickname-input"),N=document.getElementById("room-code-input"),f=document.getElementById("home-error");function h(t){f.textContent=t,f.style.display="",setTimeout(()=>{f.style.display="none"},3e3)}document.getElementById("btn-create").addEventListener("click",async()=>{const t=T.value.trim();if(!t)return h("请输入昵称");i({nickname:t});try{const e=await fetch("/api/rooms",{method:"POST"});if(!e.ok)throw new Error("HTTP error");const{room_id:s,player_id:o}=await e.json();i({roomId:s,playerId:o,isOwner:!0}),await $(s),i({page:"lobby"})}catch{h("创建房间失败，请检查服务器连接")}});document.getElementById("btn-join").addEventListener("click",async()=>{const t=T.value.trim(),e=N.value.trim().toUpperCase();if(!t)return h("请输入昵称");if(!e)return h("请输入房间号");i({nickname:t,roomId:e,playerId:crypto.randomUUID()});try{await $(e),i({page:"lobby"})}catch{h("加入房间失败，请检查房间号是否正确")}});const q=document.getElementById("app");q.insertAdjacentHTML("beforeend",`
<div id="page-lobby" class="flex-center full-h">
  <div style="display:flex;max-width:600px;width:100%;background:var(--surface);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;">

    <!-- Sidebar: player list -->
    <aside style="flex:0 0 220px;border-right:1px solid var(--border);padding:20px;">
      <h3 style="margin-bottom:12px;">玩家列表</h3>
      <ul id="player-list" class="player-list"></ul>
    </aside>

    <!-- Main: room code -->
    <main style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:20px;">
      <p class="text-muted text-sm">房间号</p>
      <div id="room-code-display" class="room-code"></div>
      <p class="text-muted text-sm">把这个发给朋友，加入房间</p>
      <button id="copy-btn" class="secondary" style="min-width:140px;">复制房间号</button>
      <div style="margin-top:16px;">
        <button id="start-btn" class="success" style="min-width:160px;font-size:16px;display:none;">开始游戏</button>
        <p id="start-hint" class="text-muted text-sm" style="margin-top:4px;">至少需要 2 名玩家</p>
      </div>
    </main>

  </div>
</div>
`);const z=document.getElementById("player-list"),U=document.getElementById("room-code-display"),j=document.getElementById("start-btn"),J=document.getElementById("start-hint"),x=document.getElementById("copy-btn");function I(t){z.innerHTML=t.map(e=>`<li class="${e.is_owner?"owner":""}">${e.is_owner?"👑 ":""}${e.nickname}</li>`).join(""),j.style.display=r.isOwner&&t.length>=2?"":"none",J.style.display=t.length<2?"":"none"}U.textContent=r.roomId;d("room_joined",t=>{i({players:t.players,isOwner:t.is_owner}),I(t.players)});d("player_joined",t=>{const e=[...r.players,t.player];i({players:e}),I(e)});d("player_left",t=>{const e=r.players.filter(s=>s.id!==t.player_id);i({players:e}),I(e)});d("game_started",t=>{i({totalRounds:t.total_rounds,page:"game"})});x.addEventListener("click",()=>{navigator.clipboard.writeText(r.roomId),x.textContent="已复制!",setTimeout(()=>{x.textContent="复制房间号"},1500)});j.addEventListener("click",()=>{y({type:"start_game"})});class G{constructor(e,s){p(this,"canvas");p(this,"ctx");p(this,"drawing",!1);p(this,"color","#000000");p(this,"width",3);p(this,"undoStack",[]);p(this,"onDrawCb",null);p(this,"readOnly",!1);this.onDraw=s,this.canvas=document.createElement("canvas"),this.canvas.width=800,this.canvas.height=500,this.canvas.style.width="100%",this.canvas.style.height="100%",this.canvas.style.cursor="crosshair",this.ctx=this.canvas.getContext("2d"),this.ctx.lineCap="round",this.ctx.lineJoin="round",this.ctx.fillStyle="#ffffff",this.ctx.fillRect(0,0,800,500),e.appendChild(this.canvas),this.onDrawCb=s||null,this.setupEvents()}setupEvents(){const e=o=>{const n=this.canvas.getBoundingClientRect(),a=this.canvas.width/n.width,c=this.canvas.height/n.height;return{x:(o.clientX-n.left)*a,y:(o.clientY-n.top)*c}};this.canvas.addEventListener("pointerdown",o=>{if(this.readOnly)return;this.drawing=!0,this.canvas.setPointerCapture(o.pointerId);const n=e(o);this.ctx.beginPath(),this.ctx.moveTo(n.x,n.y),this.emit("start",n.x,n.y)}),this.canvas.addEventListener("pointermove",o=>{if(!this.drawing||this.readOnly)return;const n=e(o);this.ctx.lineTo(n.x,n.y),this.ctx.strokeStyle=this.color,this.ctx.lineWidth=this.width,this.ctx.stroke(),this.emit("move",n.x,n.y)});const s=()=>{this.drawing&&(this.drawing=!1,this.saveUndo(),this.emit("end",0,0))};this.canvas.addEventListener("pointerup",s),this.canvas.addEventListener("pointerleave",s)}emit(e,s,o){var n;(n=this.onDrawCb)==null||n.call(this,{action:e,x:s,y:o,color:this.color,width:this.width})}saveUndo(){this.undoStack.push(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height)),this.undoStack.length>50&&this.undoStack.shift()}setColor(e){this.color=e}setWidth(e){this.width=e}remoteDraw(e){e.action==="start"?(this.ctx.beginPath(),this.ctx.moveTo(e.x,e.y)):e.action==="move"?(this.ctx.lineTo(e.x,e.y),this.ctx.strokeStyle=e.color,this.ctx.lineWidth=e.width,this.ctx.stroke()):e.action==="clear"?(this.ctx.fillStyle="#ffffff",this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height)):e.action==="undo"&&this.undoStack.length>0&&this.ctx.putImageData(this.undoStack.pop(),0,0)}clear(){this.ctx.fillStyle="#ffffff",this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height),this.undoStack=[],this.emit("clear",0,0)}undo(){this.undoStack.length>0&&(this.ctx.putImageData(this.undoStack.pop(),0,0),this.emit("undo",0,0))}setReadOnly(e){this.readOnly=e,this.canvas.style.cursor=e?"default":"crosshair"}getCanvas(){return this.canvas}}const X=document.getElementById("app");X.insertAdjacentHTML("beforeend",`
<div id="page-game" class="game-layout">
  <!-- Main: canvas + toolbar -->
  <div class="game-main">
    <div id="canvas-container" class="canvas-container" style="flex:1;"></div>
    <div id="toolbar" class="toolbar">
      <button id="tool-pen" style="background:var(--text);" title="画笔">🖊</button>
      <button id="tool-eraser" class="secondary" title="橡皮">🧹</button>
      <button id="tool-clear" class="danger" title="清空">🗑</button>
      <button id="tool-undo" class="secondary" title="撤销">↩</button>
      <span style="margin-left:8px;">颜色:</span>
      ${["#000000","#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#ffffff"].map(t=>`<button class="color-btn" data-color="${t}" style="background:${t};${t==="#ffffff"?"border:1px solid #ddd;":""}"></button>`).join("")}
      <span style="margin-left:8px;">粗细:</span>
      <input id="brush-width" type="range" min="1" max="20" value="3" />
      <span id="width-label" style="font-size:13px;min-width:20px;">3</span>
    </div>
  </div>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="timer" id="timer-display">60</div>
    <div class="hint" id="hint-display">等待画手选词...</div>
    <div style="padding:8px;border-bottom:1px solid var(--border);">
      <div style="font-weight:bold;margin-bottom:4px;">玩家</div>
      <div id="score-list" style="font-size:13px;"></div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input">
      <input id="guess-input" type="text" placeholder="输入你的猜测..." maxlength="20" />
      <button id="send-guess-btn">发送</button>
    </div>
  </aside>

  <!-- Word selection overlay (shown only for drawer) -->
  <div id="word-overlay" class="overlay" style="display:none;">
    <div class="overlay-card">
      <h3>选择一个词来画</h3>
      <div id="word-options-container" class="word-options"></div>
    </div>
  </div>

  <!-- Round result overlay -->
  <div id="round-result-overlay" class="overlay" style="display:none;">
    <div class="overlay-card">
      <h3 id="round-result-answer"></h3>
      <ul id="round-result-scores" class="ranking-list"></ul>
    </div>
  </div>
</div>
`);const Y=document.getElementById("canvas-container"),l=new G(Y,t=>{y({type:"draw",data:t})});l.setReadOnly(!0);let E="#000000",b=3;document.querySelectorAll(".color-btn").forEach(t=>{t.addEventListener("click",()=>{document.querySelectorAll(".color-btn").forEach(e=>e.classList.remove("active")),t.classList.add("active"),E=t.dataset.color,l.setColor(E),document.getElementById("tool-pen").style.background="var(--text)",document.getElementById("tool-eraser").style.background=""})});var C;(C=document.querySelector('.color-btn[data-color="#000000"]'))==null||C.classList.add("active");const S=document.getElementById("brush-width"),F=document.getElementById("width-label");S.addEventListener("input",()=>{b=parseInt(S.value),F.textContent=String(b),l.setWidth(b)});document.getElementById("tool-pen").addEventListener("click",()=>{l.setColor(E)});document.getElementById("tool-eraser").addEventListener("click",()=>{l.setColor("#ffffff"),l.setWidth(20)});document.getElementById("tool-clear").addEventListener("click",()=>{l.clear(),y({type:"draw",data:{action:"clear",x:0,y:0,color:"",width:0}})});document.getElementById("tool-undo").addEventListener("click",()=>{l.undo(),y({type:"draw",data:{action:"undo",x:0,y:0,color:"",width:0}})});const g=document.getElementById("chat-messages"),k=document.getElementById("guess-input"),K=document.getElementById("send-guess-btn");function P(t,e=""){const s=document.createElement("div");s.className=e,s.textContent=t,g.appendChild(s),g.scrollTop=g.scrollHeight}function D(){const t=k.value.trim();t&&(y({type:"guess",data:{text:t}}),k.value="")}K.addEventListener("click",D);k.addEventListener("keydown",t=>{t.key==="Enter"&&D()});const m=document.getElementById("timer-display"),v=document.getElementById("hint-display"),Q=document.getElementById("score-list");function H(){Q.innerHTML=r.players.sort((t,e)=>e.score-t.score).map(t=>`<div>${t.is_owner?"👑 ":""}${t.nickname}: ${t.score}分</div>`).join("")}d("word_options",t=>{l.setReadOnly(!1),v.textContent="选一个词开始画!",i({wordOptions:t.words,isDrawing:!0});const e=document.getElementById("word-overlay"),s=document.getElementById("word-options-container");s.innerHTML=t.words.map((o,n)=>`<button class="word-btn" data-idx="${n}">${o}</button>`).join(""),e.style.display="",s.querySelectorAll(".word-btn").forEach(o=>{o.addEventListener("click",()=>{const n=parseInt(o.dataset.idx);y({type:"select_word",data:{word_index:n}}),e.style.display="none",v.textContent="准备画画..."})})});d("word_hint",t=>{i({wordHint:t.pattern}),v.textContent=t.pattern});d("draw_data",t=>{l.remoteDraw(t)});d("timer_tick",t=>{i({secondsLeft:t.seconds_left}),m.textContent=String(t.seconds_left),t.seconds_left<=10?m.style.color="var(--danger)":m.style.color="var(--warning)"});d("guess_broadcast",t=>{P(`${t.player_name}: ${t.text}`)});d("correct_guess",t=>{P(`✅ ${t.player_name} 猜对啦! (+${t.score}分)`,"correct"),r.guessedPlayers.add(t.player_id),H()});d("round_result",t=>{i({roundScores:t.scores}),l.setReadOnly(!0),i({isDrawing:!1}),r.guessedPlayers.clear(),m.textContent="--",m.style.color="var(--warning)";const e=document.getElementById("round-result-overlay");document.getElementById("round-result-answer").textContent=`答案是: ${t.answer}`,document.getElementById("round-result-scores").innerHTML=t.scores.map(s=>`<li>${s.player_name}: +${s.score}分</li>`).join(""),e.style.display="",setTimeout(()=>{e.style.display="none"},4e3)});d("game_over",t=>{i({rankings:t.rankings,page:"result"})});d("game_started",()=>{r.guessedPlayers.clear(),r.players.forEach(t=>t.score=0),H(),m.style.color="var(--warning)",l.clear(),l.setReadOnly(!0),g.innerHTML="",v.textContent="等待画手选词...",m.textContent="60"});const V=document.getElementById("app");V.insertAdjacentHTML("beforeend",`
<div id="page-result" class="flex-center" style="min-height:100vh;">
  <div class="overlay-card" style="position:static;">
    <h2 style="font-size:28px;margin-bottom:4px;">🏆 游戏结束</h2>
    <p class="text-muted text-sm" style="margin-bottom:20px;">最终排名</p>

    <ol id="rankings-list" class="ranking-list" style="margin-bottom:24px;"></ol>

    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="play-again-btn" class="success" style="display:none;">再来一局</button>
      <button id="back-lobby-btn" class="secondary">返回大厅</button>
    </div>
  </div>
</div>
`);const Z=document.getElementById("rankings-list"),M=document.getElementById("play-again-btn"),tt=document.getElementById("back-lobby-btn");function et(t){const e=["🥇","🥈","🥉"];Z.innerHTML=t.map((s,o)=>`<li>${e[o]||""} ${s.player_name} <span>${s.score} 分</span></li>`).join(""),M.style.display=r.isOwner?"":"none"}O(t=>{t.page==="result"&&t.rankings.length>0&&et(t.rankings)});M.addEventListener("click",()=>{y({type:"start_game"})});tt.addEventListener("click",()=>{i({page:"lobby"})});O(t=>{Object.entries({home:"page-home",lobby:"page-lobby",game:"page-game",result:"page-result"}).forEach(([s,o])=>{const n=document.getElementById(o);n&&(n.style.display=s===t.page?"":"none")})});i({page:"home"});
