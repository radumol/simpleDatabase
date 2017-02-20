var MongoClient = require('mongodb').MongoClient;
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var hat = require('hat'); //creates random tokens

var DBURL = "mongodb://localhost:27017/recipesDB";

app.set('views','./views');
app.set('view engine','pug');

app.use(function(req,res,next){
	console.log(req.method+" request for "+req.url);
	next();
});


//serve main page + credentials
app.get(['/', '/index.html', '/home', '/index'], cookieParser(), function(req,res){
	MongoClient.connect("mongodb://localhost:27017/recipesDB",function(err,db){
		if(err){
			console.log("Error opening db: ",err);
			res.sendStatus(500);
		}else{
			db.collection("users").findOne({username:req.cookies.username},function(err,user){ //assume unique usernames.
				if(user && user.auth===req.cookies.token){
					console.log("User authenticated.");
					res.render('index',{user: {username:req.cookies.username, auth:user.auth, events: user.events}});
				}else{
					res.render('index',{});
				}
				db.close();
			});
		}
	});
});

//send user login page
app.get('/login', function(req,res){
	res.render('login');
});
//send user registration page
app.get('/register', function(req,res){
	res.render('register');
});

app.use(['/login','/register'], bodyParser.urlencoded({extended:false}));

//register new user
app.post('/register', function(req,res){
	MongoClient.connect("mongodb://localhost:27017/recipesDB", function(err,db){
		db.collection("users").findOne({username:req.body.username.toLowerCase()},function(err,user){
			if(err){
				console.log("Error connecting to mongo server: ", err);
				res.sendStatus(500);
				db.close();
			}else if(user){ 	//if name exists
				//render login page with warning
				res.render('register',{warning:"Username already exists"});
				db.close();
			}else{ //user not found
				//add to db, and perform authentication
				var user = new User(req.body.username.toLowerCase(), req.body.password);
				//create auth token
				var token = hat(); //create a random token
				user.auth=token; //save token with the specific user
				user.collectionName = req.body.username.toLowerCase() +"Recipes";
				db.collection("users").insert(user, function(err,result){
					if(err){
						console.log("Error inserting into database: ",err);
						res.sendStatus(500);
					}else{	
						//db.createCollection(req.body.username.toLowerCase()+"Recipes");
						createAuthCookies(user,res);
						//tell the browser to request the main page
						res.redirect("/");
					}
					db.close();
				});
				
			}
		});
	});
});

//handle user login
app.post('/login', function(req,res){
	//console.log(req.body);  //uncomment to see the login data object
	
	MongoClient.connect("mongodb://localhost:27017/recipesDB", function(err,db){
		db.collection("users").findOne({username:req.body.username.toLowerCase()},function(err,user){
			console.log("user found: ",user);
			if(err){
				console.log("Error connecting to mongo server: ", err);
				res.sendStatus(500);
				db.close();
			}else if(!user){ //not found
				res.render('login',{warning:"Username not found"});
				db.close();
			}else if(user.password!==req.body.password){  //user exists, wrong password
				console.log("incorrect password: ", user.password+"!="+req.body.password);
				res.render('login',{warning:"Incorrect password"});
				db.close();
			}else{	//user exists && pwd correct
				console.log("Log in successful");
				//create auth token
				var token = hat(); //create a random token
				user.auth=token; //save token with the specific user
				
				db.collection("users").update({_id:user._id},user,function(err,result){ //update the document
					if(err){
						console.log("Error updating the database: ",err);
						res.sendStatus(500);
					}else{
						createAuthCookies(user,res);
						res.redirect("/");
					}	
					db.close();
				});
			}
		});
	});
});

app.use("/recipes",cookieParser());
app.get("/recipes", function(req,res){
	//connect to the db
	//console.log(req.body);
	console.log("all recipes, the username: " + req.cookies.username);
	
	MongoClient.connect(DBURL, function(err,db){
		if(err){
			console.log("Error connecting to the DB");
			res.sendStatus(500);
		}else{
			
			//find the requesting user (assume unique usernames)
			db.collection("users").findOne({username:req.cookies.username},function(err,user){ 
				if(err){
					console.log("Error opening db: ",err);
					res.sendStatus(500);
				}else{
					//authenticate the request
					if(user && user.auth===req.cookies.token){
						console.log("User authenticated.");
						
						var recipeNames = [];
						var cursor = db.collection(req.cookies.username+"Recipes").find().each(function(err, document){
							if (err)
								res.sendStatus(500);
							else{
								if(!(document === null)){
									console.log(document.name);
									recipeNames.push(document.name);
								}else{
									console.log(recipeNames);	
									res.send({names:recipeNames});
									db.close();
								}
							}
						});
					}else{ //not authenticated
						res.sendStatus(401);
						db.close();
					}
				}
			});
		}	
	});
});


app.use("/recipes/:name",cookieParser());
app.get('/recipes/:name', function(req , res){
  
  //res.render('article' + req.params.id);
  console.log("specific recipe, the username: " + req.cookies.username);
  
  var url = req.url.split("?");
  var name = url[0].split("/"); //good enough? how to handle "dried tomato"??
  console.log("here yo!, url contents: "+name[2] );
  MongoClient.connect(DBURL, function(err,db){
		if(err){
			console.log("Error connecting to the DB");
			res.sendStatus(500);
		}else{
			db.collection(req.cookies.username+"Recipes").findOne({name:name[2]}, function(err, rName){
				//console.log("this is the name: " + rName.name);
				
				if(err){
					console.log("Error connecting to mongo server: ", err);
					res.sendStatus(500);
					db.close();
				}else if(!rName){
					console.log("Recipe not found");
					res.sendStatus(404);
					db.close();
				}else{
					res.send(rName); //send whole rName or just name, ingredients etc ?
					db.close();
				}
			});
		}	
	});
});


app.use("/recipe",cookieParser());
app.use(['/recipe'], bodyParser.urlencoded({extended:true}));

app.post("/recipe", function(req, res){
	console.log(req.body);
	MongoClient.connect(DBURL, function(err,db){
		if(err){
			console.log("Error connecting to the DB");
			res.sendStatus(500);
		}else if(!req.body.name){
			console.log("Bad request");
			res.sendStatus(400);
			db.close();
		}else{
			db.collection(req.cookies.username+"Recipes").findOne({name:req.body.name}, function(err, recipeObj){
				//console.log("this is the name: " + recipeObj.name);
				
				if(err){
					console.log("Error connecting to mongo server: ", err);
					res.sendStatus(500);
					db.close();
				}else if(recipeObj){
					console.log("updating");
					db.collection(req.cookies.username+"Recipes").update({_id: recipeObj._id}, req.body);
					res.sendStatus(200);
					db.close();
				}else if(!recipeObj){
					db.collection(req.cookies.username+"Recipes").insert(req.body);
					res.sendStatus(200);
					db.close();
				}
			});
		}
	});	
});


app.use(express.static("./public"));
app.listen(2406,function(){console.log("Server is listening for PUG requests on 2406");});

//constructor for users
function User(name,pass){
	this.username = name;
	this.password = pass;
}
function createAuthCookies(user,res){
	//create auth cookie
	res.cookie('token', user.auth, {path:'/', maxAge:3600000});
	res.cookie('username', user.username, {path:'/', maxAge:3600000});
}