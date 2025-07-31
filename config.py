from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

app = Flask(__name__) # initialise app
CORS(app) # wrap in CORS

# INITIALISE DATABASE
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///nbadatabase.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False # Not tracking all changes made to databases

db = SQLAlchemy(app) # creating an instance of the database from the database file path above

# Can change the database now using python as SQLAlchemy translates it into SQL using SQLAlchemy