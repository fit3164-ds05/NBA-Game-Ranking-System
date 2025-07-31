from flask import request, jsonify
from config import app, db
# from models import all the tables

# REQUESTS

# Each request has a type
# GET: access some type of resource
# POST: create something new
# PATCH: Update something
# DELETE: delete something

# Each request has json data we can send
# Information that comes along with the request that is used when handling the request.

# The BACKEND returns a response
# Status: 200 is accepted
# Status: 404, request is not found
# Status: 400, bad request...

