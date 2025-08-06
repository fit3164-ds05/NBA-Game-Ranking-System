from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Bring in CORS for 


# From CSV
# Import the csv and read as a pandas dataframe
# From there turn to dictionary and jsonify it
# From there it works the same

@app.route("/api") # Only permits GET Requests
def users():
    return jsonify(
        {
            "users": [
                'User1',
                'User2',
                'User3',
                'User4'
            ]
        }
    )

if __name__ == "__main__":
    app.run(debug=True)
