import express from 'express';
import path from 'path';
import ws, { WebSocket } from 'ws';
import http from 'http';
import randomWords from 'random-words';

const app = express();
const PORT = process.env.PORT || 3000;

let visits = 0;

app.use(express.static('redirect'));
app.get('/room/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../redirect/redirect.html'));
});

app.get('/', (req, res) => {
  app.use(express.static('build'));
  visits++;
  res.sendFile(path.join(__dirname, '../build/index.html'));
});

app.get("/visits", (req, res) => {
  res.send(JSON.stringify({visits: visits}));
});

const server = http.createServer(app);
const wss = new ws.Server({ server });

server.listen(PORT, () => console.log("INFO: Server on Port: " + PORT));

interface Room{
    room: string;
    player1: any;
    player2: any;
    currentXO: string;
    currentPlayer: any;
    gameBoard: {fieldVal: string, claimed: boolean}[][];
    ended: boolean;
}

let rooms: Room[] = [];

const getRoomIndex = (room: string) => {
    for(let i = 0; i<rooms.length; i++){
        if(rooms[i].room === room){
            return i;
        }
    }
    return -1;
}

const newBoard = () => {
    let board: {fieldVal: string, claimed: boolean}[][] = [];
    for(let i = 0; i<3; i++){
        let row: {fieldVal: string, claimed: boolean}[] = [];
        for(let j = 0; j<3; j++){
            row.push({fieldVal: "", claimed: false});
        }
        board.push(row);
    }
    return board;
}

wss.on('connection', socket => {
    socket.on('close', () => {
      for(let i = 0; i<rooms.length; i++){
        const room = rooms[i];
        rooms.splice(i, 1);
        if(socket === room.player1){
          if(room.player2){
            room.player2.send(JSON.stringify({status: "disconnect"}));
          }
        }else if(socket === room.player2){
          if(room.player1){
            room.player1.send(JSON.stringify({status: "disconnect"}));
          }
        }
      }
    });
    socket.on('message', data => {
        const message = JSON.parse(data.toString());
        if(message.status === "idRequest"){
            const randNum = Math.floor(Math.random() * (99 - 1) + 1);
            const randWord = randomWords();
            const id = randWord + randNum;
            let emptyBoard = newBoard();
            rooms.push({room: id, player1: socket, player2: undefined, currentXO: "X", currentPlayer: socket, gameBoard: emptyBoard, ended: false});
            socket.send(JSON.stringify({status: "join", room: id}));
        }else if(message.status === "requestToJoin"){
            const id = message.room;
            const roomIndex = getRoomIndex(id);
            if(roomIndex >= 0){
                if(rooms[roomIndex].player2){
                    socket.send(JSON.stringify({status: "error", errorMessage: "room already full"}));
                }else{
                    rooms[roomIndex].player2 = socket;
                    const board = rooms[roomIndex].gameBoard;
                    socket.send(JSON.stringify({status: "join", room: id}));
                    const player1 = rooms[roomIndex].player1;
                    const player2 = rooms[roomIndex].player2;
                    player1.send(JSON.stringify({status: "board", board: board, turn: true, XO: rooms[roomIndex].currentXO}));
                    player2.send(JSON.stringify({status: "board", board: board, turn: false, XO: rooms[roomIndex].currentXO}));
                }
            }else{
                socket.send(JSON.stringify({status: "error", errorMessage: "room does not exist"}));
            }
        }else if(message.status === "move"){
            const i = message.i;
            const j = message.j;
            const index = getRoomIndex(message.room);
            const room = rooms[index];
            const currentXO = room.currentXO;
            const board = room.gameBoard;
            if( ! board[i][j].claimed && room.player2 && socket === room.currentPlayer){
                board[i][j].fieldVal = currentXO;
                board[i][j].claimed = true;
                room.currentPlayer = room.currentPlayer === room.player1 ? room.player2 : room.player1;
                room.currentXO = currentXO === "X" ? "O" : "X"; 
                if(room.currentPlayer === room.player1){
                    room.player1.send(JSON.stringify({status: "board", board: room.gameBoard, turn: true, XO: room.currentXO}));
                    room.player2.send(JSON.stringify({status: "board", board: room.gameBoard, turn: false, XO: room.currentXO}));
                }else{
                    room.player1.send(JSON.stringify({status: "board", board: room.gameBoard, turn: false, XO: room.currentXO}));
                    room.player2.send(JSON.stringify({status: "board", board: room.gameBoard, turn: true, XO: room.currentXO}));
                }
                const gameResult = checkWin(board.map(row => row.map(field => field.fieldVal)));
                if(gameResult){
                    room.gameBoard.forEach(row => {
                        row.forEach(field => {
                            field.claimed = true;
                        });
                    });
                    room.ended = true;
                    room.player1.send(JSON.stringify({status: "end", winner: gameResult.winner, winningFields: gameResult.winningFields}));
                    room.player2.send(JSON.stringify({status: "end", winner: gameResult.winner, winningFields: gameResult.winningFields}));
                }
            }
        }else if(message.status === "newgame"){
            const roomIndex = getRoomIndex(message.room);
            const room = rooms[roomIndex];
            if(room.ended){
                room.gameBoard.forEach(row => {
                    row.forEach(field => {
                        field.claimed = false;
                        field.fieldVal = "";
                    });
                });
                room.currentXO = "X";
                room.ended = false;
                if(room.currentPlayer === room.player1){
                    room.player1.send(JSON.stringify({status: "board", board: room.gameBoard, turn: true, XO: room.currentXO}));
                    room.player2.send(JSON.stringify({status: "board", board: room.gameBoard, turn: false, XO: room.currentXO}));
                }else{
                    room.player1.send(JSON.stringify({status: "board", board: room.gameBoard, turn: false, XO: room.currentXO}));
                    room.player2.send(JSON.stringify({status: "board", board: room.gameBoard, turn: true, XO: room.currentXO}));
                }  
            }
        }
    });
});

const checkWin = (board: string[][]) => {
    let winningFields = [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}];
    let winningFieldsIndex = 0;
  
    //Horizontal Winner
    for(let i = 0; i<3; i++){
      if(board[i][0] !== ""){
        let winner = board[i][0];
        let wincount = 0;
        for(let j = 0; j<3; j++){
          if(board[i][j] === winner){
            wincount++;
            winningFields[winningFieldsIndex++] = {i: i, j: j};
          }
        }
        if(wincount === 3){
          return {winner: winner, winningFields: winningFields};
        }else{
          winningFields = [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}];
          winningFieldsIndex = 0;
        }
      }
    }
  
    //Vertical Winner
    for(let i = 0; i<3; i++){
      if(board[0][i] !== ""){
          let winner = board[0][i];
          let wincount = 0;
          for(let j = 0; j<3; j++){
            if(board[j][i] === winner){
              wincount++;
              winningFields[winningFieldsIndex++] = {i: j, j: i};
            }
          }
          if(wincount === 3){
            return {winner: winner, winningFields: winningFields};
          }else{
            winningFields = [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}];
            winningFieldsIndex = 0;
          }
      }
    }
  
    //Across from top-left winner
    if(board[0][0] !== ""){
      const topLeftWinner = board[0][0];
      let topLeftWincount = 0;
      for(let i = 0; i<3; i++){
        if(board[i][i] === topLeftWinner){
          topLeftWincount++;
          winningFields[winningFieldsIndex++] = {i: i, j: i};
        }
      }
      if(topLeftWincount === 3){
        return {winner: topLeftWinner, winningFields: winningFields};
      }else{
        winningFields = [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}];
        winningFieldsIndex = 0;
      }
    }
  
    //Across from bottom-left winner
    if(board[2][0] !== ""){
      const bottomLeftWinner = board[2][0];
      let bottomLeftWincount = 0;
      let j = 2;
      for(let i = 0; i<3; i++){
        if(board[j][i] === bottomLeftWinner){
          bottomLeftWincount++;
          winningFields[winningFieldsIndex++] = {i: i, j: j};
        }
        j--;
      }
      if(bottomLeftWincount === 3){
        return {winner: bottomLeftWinner, winningFields: winningFields};
      }else{
        winningFields = [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}];
        winningFieldsIndex = 0;
      }
    }
  
    //Check tie
    let tieCount = 0;
    for(let i = 0; i<3; i++){
      for(let j = 0; j<3; j++){
        if(board[i][j] !== ""){
          tieCount++;
        }
      }
    }
    if(tieCount >= 9){
      return {winner: "Tie", winningFields: [{i: 0, j: 0}, {i: 0, j: 0}, {i: 0, j: 0}]};
    }
  
    return undefined;
  }