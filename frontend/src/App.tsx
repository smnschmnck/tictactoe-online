import React, { useState } from 'react';
import './App.css';
import QRCode from "react-qr-code";
//const socket = new WebSocket('ws://localhost:3030');
const socket = new WebSocket(window.location.origin.replace(/^http/, 'ws'))

socket.onopen = () => {
  if(localStorage.getItem("room")){
    const room = localStorage.getItem("room");
    localStorage.removeItem("room");
    socket.send(JSON.stringify({status: "requestToJoin", room: room}));
  }
}

const App = () => {
  const[joined, setJoined] = useState(false);
  const[roomID, setRoomID] = useState("");
  const[showBoard, setShowBoard] = useState(false);
  const[gameInfo, setGameInfo] = useState("");
  const[showNewGame, setShowNewGame] = useState(false);

 
  if(roomID){
    document.title = "TicTacToe - Room: " + roomID;
  }else{
    document.title = "TicTacToe";
  }

  const newBoard = () => {
    let board: {fieldVal: string, claimed: boolean, winningField: boolean}[][] = [];
    for(let i = 0; i<3; i++){
        let row: {fieldVal: string, claimed: boolean, winningField: boolean}[] = [];
        for(let j = 0; j<3; j++){
            row.push({fieldVal: "", claimed: false, winningField: false});
        }
        board.push(row);
    }
    return board;
  }

  const[board, setBoard] = useState(newBoard());
  
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    switch (message.status) {
      case "join":
        setJoined(true);
        setRoomID(message.room)
        break;
      case "board":
        if(showNewGame){
          setShowNewGame(false);
        }
        setBoard(message.board);
        setShowBoard(true);
        const xo = message.XO;
        setGameInfo(message.turn ? "Your turn as " + xo : "Wait");
        break;
      case "end":
        if(message.winner !== "Tie"){
          setGameInfo("Winner: " + message.winner);
          let tmpBoard = newBoard();
          for(let i = 0; i<3; i++){
            for(let j = 0; j<3; j++){
              tmpBoard[i][j].claimed = true;
              tmpBoard[i][j].fieldVal = board[i][j].fieldVal;
            }
          }
          for(let x = 0; x<message.winningFields.length; x++){
            const i = message.winningFields[x].i;
            const j = message.winningFields[x].j;
            tmpBoard[i][j].winningField = true;
          }
          setBoard(tmpBoard);
        }else{
          setGameInfo("Tie!");
        }
        setShowNewGame(true);
        break;
      case "disconnect":
        alert("Other player disconnected! Refresh page to start a new game.")
        window.location.reload();
        break;
      case "error":
        alert(message.errorMessage);
        break;
      default:
        break;
    }
  }

  const addPlayerToField = (i: number, j: number) => {
    socket.send(JSON.stringify({status: "move", room: roomID, i: i, j: j}));
  }

  const clearBoard = () => {
    socket.send(JSON.stringify({status: "newgame", room: roomID}));
  }

  return(
    <div className="App">
        <div className="Main">
        {joined ? 
          <div className="Game">
            {showBoard ? 
            <div className="Board">
                <h1 className="Winner">{gameInfo}</h1>
                {board.map((row , i) => 
                  <div className="Row" key={i}>{row.map((field, j) => 
                    <button 
                      className={field.winningField ? "WinningField" : "Field"}
                      key={i+":"+j} 
                      onClick={() => addPlayerToField(i, j)}>
                    {field.fieldVal}</button>)}
                  </div>)}
                  <button className="NewGameButton" style={{visibility: showNewGame ? 'visible' : 'hidden'}} onClick={() => clearBoard()}>New Game</button>
            </div> : <WaitingRoom roomID={roomID}/> }
          </div>
        : <JoinRoom/>}
      </div>
    </div>
  );
}

interface waitingRoomProps{
  roomID: string;
}

const WaitingRoom: React.FC<waitingRoomProps> = ({roomID}) => {
  const[buttonText, setButtonText] = useState("Copy Invite");
  const[copied, setCopied] = useState(false);
  const[showQR, setShowQR] = useState(false)
  const link = window.location.href + "room/" + roomID;

  const shareLink = () => {
    navigator.clipboard.writeText(link);
    setButtonText("Copied!");
    setCopied(true);
  }

  return(
    <div className="WaitingRoom">
      <div>
        <p className="Waiting">Waiting for player 2</p>
        <p className="ShowRoomID"><b>Room ID: </b>{roomID}</p>
      </div>
      <div className="ShareDiv">
        <button className={copied ? "CopiedButton" : "CopyButton"} onClick={() => shareLink()}>{buttonText}</button>
        <div className="QRDiv">
          {showQR ? 
            <QRCode className="QR" value={link} size={150}/> : 
            <button className="QRButton" onClick={() => setShowQR(true)}>Show QR Code Invite</button> 
          }
        </div>
      </div>
    </div>
  );
}

const JoinRoom = () => {
  const[inputID, setInputID] = useState("");

  const requestID = () => {
    socket.send(JSON.stringify({status: "idRequest"}));
  }

  const sendJoinRequest = () => {
    socket.send(JSON.stringify({status: "requestToJoin", room: inputID}));
  }

  return(
    <div className="JoinRoom">
      <form className="RoomForm" onSubmit={e => e.preventDefault()}>
        <h1>Join Room</h1>
        <div className="RoomFormControls">
          <input className="RoomInput" placeholder="Room ID" onChange={e => setInputID(e.target.value)} autoFocus/>
          <button className="JoinRoomButton" onClick={() => sendJoinRequest()}>Join</button>
        </div>
      </form>
      <h1>or</h1>
      <div className="CreateRoom">
        <h1>Create Room</h1>
        <button className="JoinRoomButton" onClick={() => requestID()}>Create Room</button>
      </div>
    </div>

  );
} 

export default App;