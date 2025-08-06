import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import axios from 'axios';

function About() {

  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchAPI = async () => {
      try {
        const res   = await fetch("/api");   // proxied to Flask
        const data  = await res.json();      // <-- parse body
        setUsers(data.users);                // ["User1", ]
      } catch (err) {
        console.error("API error:", err);
      }
    };
    fetchAPI();
  }, []);

  return (

    <div>
    {users.map((u, idx) => (
      <div key={idx}>
        <span>{u}</span>
        <br />               
      </div>
    ))}
  </div>
  )
}

export default About