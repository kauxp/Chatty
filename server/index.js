import express from 'express';
import { db, auth } from './config.js';
import { ref, set, get, onValue, push } from 'firebase/database';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import cors from 'cors';

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());


//register a new user

app.post('/register', (req, res) => {
  const { email, password, username } = req.body;
  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      console.log("User registered successfully");
      const user = userCredential.user;
      const userRef = ref(db, 'users/' + user.uid);
      set(userRef, {
        username,
        email
      })
        .then(() => {
          res.status(200).send("User registered successfully")
        })
        .catch((err) => {
          res.status(500).send("Error creating user profile" + err);
        })
    })
    .catch((err) => {
      res.status(500).send("Error registering user" + err);
    })
})


//login a user

app.post('/login', async (req, res) => {
  const { email, password, googleToken } = req.body;
  if (googleToken) {
    //sign in with google
    if (googleToken) {
      try {
        const credential = GoogleAuthProvider.credential(googleToken);
        const userCredential = await signInWithCredential(auth, credential);
        const user = userCredential.user;
        res.status(200).send("User logged in successfully with Google");
      } catch (error) {
        console.error("Error logging in with Google:", error);
        res.status(500).send("Error logging in with Google: " + error.message);
      }
    } else {
      res.status(400).send("Google token not provided");
    }
  } else {
    //sign in with email and password
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        console.log("User logged in successfully");
        res.status(200).send("User logged in successfully");
      })
      .catch((err => {
        console.log("Error loggin in user" + err);
        res.status(500).send("Error loggin in user" + err);
      }))
  }
})


//create a new room

app.post('/rooms', async (req, res) => {
  const { name, createdBy, members } = req.body;
  const roomUserRef = ref(db, 'users/' + createdBy);

  try {
    //check if user can create the room
    get(roomUserRef).then((snapshot) => {
      if (!snapshot.exists()) {
        res.send(403).send("You are not authorized to create a room");
      }
    })

    //check members exists or not
    const membersExistence = members.map(async memberId => {
      const memberRef = ref(db, 'users/' + memberId);
      const memberSnapshot = await get(memberRef);
      if (!memberSnapshot.exists()) {
        res.status(404).send("User " + memberId + " not found");
      }
      return memberSnapshot
    })
    await Promise.all(membersExistence);

    const roomRef = ref(db, 'rooms');
    const newRoomRef = push(roomRef);

    set(newRoomRef, {
      name,
      createdBy,
      members
    })
      .then(() => {
        res.status(200).send("Room created successfully");
      })
      .catch((err) => {
        res.status(500).send("Error creating room" + err.message);
      })
  } catch (error) {
    if (error.message.includes("does not exist")) {
      res.status(404).send(error.message);
    } else {
      res.status(500).send("Error creating room: " + error.message);
    }
  }

})


//send message to a room

app.post('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const { userId, username, message } = req.body;
  const messagesRef = ref(db, 'messages/' + roomId);
  const newMessageRef = push(messagesRef);
  set(newMessageRef, {
    userId,
    username,
    message,
    timestamp: Date.now()
  })
    .then(() => {
      res.status(200).send("Message sent successfully");
    })
    .catch((err) => {
      res.status(500).send("Error sending message" + err);
    })
})


//get messgaes from a room

app.get('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const messagesRef = ref(db, 'messages/' + roomId);

  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      res.status(200).send(snapshot.val());
    } else {
      res.status(404).send('No messages found');
    }
  }).catch((err) => {
    res.status(500).send('Error fetching messages: ' + err);
  });
});


//create one-one chats

app.post('/chats', (req, res) => {
  const { from, to } = req.body;
  const fromRef = ref(db, 'users/' + from);
  const toRef = ref(db, 'users/' + to);
  Promise.all([get(fromRef), get(toRef)])
    .then(([fromSnapshot, toSnapshot]) => {
      if (fromSnapshot.exists() && toSnapshot.exists()) {
        const chatId = from < to ? `${from}-${to}` : `${to}-${from}`;
        const chatRef = ref(db, 'chats/' + chatId);

        get(chatRef).then((snapshot) => {
          if (snapshot.exists()) {
            res.status(403).send("Chat already exists");
          } else {
            set(chatRef, {
              participants: [from, to],
              createdAt: Date.now()
            })
              .then(() => {
                res.status(200).send("Chat created successfully");
              })
              .catch((err) => {
                res.status(500).send("Error creating chat: " + err);
              });
          }
        })
          .catch((err) => {
            res.status(500).send("Error checking chat room: " + err);
          });
      } else if (!fromSnapshot.exists() && toSnapshot.exists()) {
        res.status(404).send("User " + from + " not found");
      } else if (fromSnapshot.exists() && !toSnapshot.exists()) {
        res.status(404).send("User " + to + " not found");
      } else {
        res.status(404).send("Users " + from + " and " + to + " not found");
      }
    })
    .catch((err) => {
      res.status(500).send("Error checking users: " + err);
    });
});



//send message in one-one chat

app.post('/chats/:chatId/messages', (req, res) => {
  const { chatId } = req.params;
  const { from, message } = req.body;
  const messagesRef = ref(db, 'chats/' + chatId + '/messages');
  const newMessageRef = push(messagesRef);

  set(newMessageRef, {
    from,
    message,
    timestamp: Date.now()
  })
    .then(() => {
      res.status(200).send("Message sent successfully");
    })
    .catch((err) => {
      res.status(500).send("Error sending message" + err);
    })
})


//get messages from one - one chat

app.get('/chats/:chatId/messages', (req, res) => {
  const { chatId } = req.params;
  const messagesRef = ref(db, 'chats/' + chatId + '/messages');

  get(messagesRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        res.status(200).send(snapshot.val());
      } else {
        res.status(404).send('No messages found');
      }
    })
    .catch((err) => {
      res.status(500).send('Error fetching messages: ' + err);
    });
});



app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})