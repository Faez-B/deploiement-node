require("dotenv").config();

// Modules
const express = require('express');
const mongoose = require('mongoose');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const jwt  = require('jsonwebtoken');
const cors = require('cors');
const { resolve } = require("path");

const port = process.env.PORT || 8000;

const app = express();

const corsOptions = {
    origin: true,
    exposedHeaders: "*"
    // methods: "GET,HEAD,PUT,PATCH,POST,DELETE"
}

// Middlewares
app.use(express.json());
app.use(cors(corsOptions));
// app.use(cors());

// app.use(function(req, res, next) {
//     res.header("Access-Control-Allow-Origin", "*");
//     res.header("Access-Control-Allow-Headers", "*");
//     next();
// })

let _id = 1;

// Schémas
    // User
    const userSchema = new mongoose.Schema({
        _id : Number,
        email : String,
        password : String
    });

    const joiUserSchema = Joi.object({
        email : Joi.string().min(4).max(255).required(),
        password : Joi.string().min(2).max(255).required(),
    })


    // Todo
    const todoSchema = new mongoose.Schema({
        _id : Number,
        name : String,
        userId : Number
    });

    const joiTodoSchema = Joi.object({
        name : Joi.string().min(2).max(255).required(),
        userId : Joi.number().required()
    });

// Tables
const User = mongoose.model('User', userSchema);
const Todo = mongoose.model('Todo', todoSchema);

let connected = false;
// Connexion à MongoDB
mongoose.connect(`mongodb+srv://Faez:${process.env.MONGO_PWD}@cluster0.3sely22.mongodb.net/?retryWrites=true&w=majority`)
.then( function () {
    console.log("Connecté à la BDD");
    connected = true;
    // let object = await Todo.findById(_id);

    // while ( ! (object == null)) {
    //     _id = _id + 1;
    //     object = await Todo.findById(_id);
    // }
})
.catch( () => {
    console.log("Non connecté")
})

// Logique User
let token = null;

function authGuard(req, res, next) {
    if (!token) return res.status(401).json({erreur: "Vous devez vous connecter"})
  
    try {
      const decoded = jwt.verify(token, process.env.JWT); 
      req.user = decoded;
      next();
    } catch (exc) {
      return res.status(403).json({erreur: "Token Invalide"})
    }
}

app.get('/', (req, res) => {
    res.status(200).send({ message: "Hello world Node!", connected: connected });
})

app.get('/moncompte',[authGuard], async (req, res) => {

    const user = await User.findById(req.user.id).exec()
    .then( (data) => {
        // delete data.password;
        data.password = undefined;
        res.status(200).send(data);
    })
    .catch( (err) => {
        res.status(404).send("Utilisateur non trouvé");
    })
    ;
})

app.post('/signup', async (req, res) => {
    const payload = req.body;

    const {error} = joiUserSchema.validate(payload);

    if ( ! error) {
        let id = _id++;

        const userFound = await User.findOne({email : payload.email}).exec()
            .then( async (data) => {
                if ( ! data) {
                    const salt = await bcrypt.genSalt(10);
                    let { password } = payload;
                    passwordHashed = await bcrypt.hash(password, salt);
                    payload.password = passwordHashed;
                    
                    const user = new User({...payload, _id : id});
                    await user.save();

                    delete payload.password;
                    res.status(201).send({...payload, _id : id});
                }

                else {
                    res.send("Cette adresse est déjà associé à un compte");
                };

            })
        ;
    }
    else {
        res.status(400).send({ erreur : error.details[0].message });
    }
})

app.post('/signin', async (req, res) => {
    const payload = req.body;

    const {error} = joiUserSchema.validate(payload);

    if ( ! error) {
        const user = await User.findOne({email : payload.email}).exec()
            .then( async (data) => {
                if (data) {
                    const passwordIsValid = await bcrypt.compare(payload.password, data.password);
                    if (passwordIsValid) {
                        token = jwt.sign( {email : data.email, id : data._id}, process.env.JWT);
                        res.header("x-auth-token", token).status(200).send(token);
                    }
                    else {
                        res.send("Mot de passe incorrect");
                    }
                    
                }
                else {
                    res.send("Ce compte n'existe pas");
                }
            })
        ;

        // user.password = undefined;
        // res.send(user);
    }

    else{
        res.status(400).send({ erreur : error.details[0].message });
        // res.send("erreur");
    }
})

app.get('/signout', (req, res) => {
    if (token) {
        token = null;
        res.header("x-auth-token", token).status(200).send("Déconnecté");
    }

    else{
        res.send({ message : "Aucun utilisateur n'est connecté" });
    }
})


// Logique Todo
app.get("/getAll/:userId", async (req, res) => {
    const payload = req.params;
    
    const todosUser = [];

    const todos = await Todo.find().exec()
        .then( (data) => {
            data.forEach(element => {
                if (element.userId == payload.userId) {
                    todosUser.push(element);
                }
            });
        })
    ;

    res.status(200).send(todosUser);
})

app.get("/getOne/:id", async (req, res) => {
    const payload = req.params;

    const todo = await Todo.findById(payload.id).exec()
        .then( (data) => {
            res.status(200).send(data);
        })
        .catch( (err) => {
            res.status(404).send("Todo non trouvé");
        })
    ;
})

app.post("/addOne", async (req, res) => {
    const payload = req.body;
    
    const {error} = joiTodoSchema.validate(payload);

    if (error) {
        res.status(400).send({ erreur : error.details[0].message });
    }

    else{
        let id = _id++;
        const todo = new Todo({
            ...payload, 
            _id : id, 
            userId: parseInt(payload.userId)
        });
        await todo.save();
        res.status(201).send({payload, id : _id});
    }
})

app.put("/updateOne", async (req, res) => {
    const payload = req.body;

    const todo = await Todo.findByIdAndUpdate(payload.id, payload.name);

    todo.name = payload.name;

    await todo.save();

    res.status(201).send("Todo a été modifier")
})

app.delete("/deleteOne/:id", async (req, res) => {
    const payload = req.params;

    Todo.findByIdAndDelete({_id : parseInt(payload.id)}).exec()
        .then( (data) => {
            // res.status(200).send(data);
            res.send("Todo supprimé");
        })
        .catch( (err) => {
            res.status(404).send("Todo non trouvé");
        })
    ;
    
})

app.get("/random", async (req, res) => {
    let random = null;
    if ( !token ) {
        
        // const todo = await Todo.count().exec(count)
        //     random = Math.floor(Math.random()  * count );
        //     // Todo.findOne().skip(random).exec(
        //     //     function (err, result) {
        //     //       console.log(result) 
        //     //     }
        //     // )
        // ;
    }

    else{
        // res.status(200).send("OK");
    }

    res.send("default");
})

if (process.env.NODE_ENV !== 'test') 
{
    app.listen(port, () => { console.log(`Écoute sur le port ${port}`); })
}

