-Download and extract the these files to you local machine.  

-Update the .env file to contain your password instead of the default password.  
--Mother is password protected to only prevent players clicking the wrong button, this is not true security

-Navigate to the Muther-Public directory
-Run docker compose up -d.  
--For windows you can use docker desktop, wsl, and  to run this
--Linux and Mac you can install docker at the command line, you'll need to search how to do that based on your OS.

-Access the interface at http://<your-computer-ip>:8080 or http://localhost:8080
--GMs access the Muther panel, and player devices use the Crew panel
--If you want to access the app not on the hosting device you'll need that devices IP
--If port 8080 is already used, modify the docker-compose.yaml and change 8080 to your desired port



  