// Check if player with same name exists (reconnection scenario)
const existingPlayer = room.players.find(p => p.name === sanitizedName);

if (existingPlayer) {
  // Player is reconnecting - update their socket ID
  console.log(`🔄 Player '${sanitizedName}' is reconnecting to room '${sanitizedRoomCode}'.`);
  
  const oldSocketId = existingPlayer.id;
  existingPlayer.id = socket.id;
  
  // Update players map
  players.delete(oldSocketId);
  players.set(socket.id, { roomCode: sanitizedRoomCode, name: sanitizedName });
  
  socket.join(sanitizedRoomCode);
  socket.emit("joinedRoom", { 
    roomCode: sanitizedRoomCode, 
    player: existingPlayer, 
    players: room.players 
  });
  socket.broadcast.to(sanitizedRoomCode).emit("playerRejoined", { 
    player: existingPlayer, 
    players: room.players 
  });
  
  console.log(`✅ '${sanitizedName}' reconnected to room '${sanitizedRoomCode}'.`);
  return;
}