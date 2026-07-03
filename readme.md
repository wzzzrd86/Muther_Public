# Setup

- Download and extract the these files to you local machine.  
- Update the .env file to contain your password instead of the default password.  
  - Mother is password protected to only prevent players clicking the wrong button, this is not true security
- Navigate to the Muther-Public directory
- Run `docker compose up -d`.  
  - For windows you can use docker desktop, wsl, and  to run this
  - Linux and Mac you can install docker at the command line, you'll need to search how to do that based on your OS.
  - if you delete the containers created you will lose any saved sessions
- Access the interface at `http://<your-computer-ip>:8080` or `http://localhost:8080`
  - GMs access the Muther panel, and player devices use the Crew panel
  - If you want to access the app not on the hosting device you'll need that devices IP
  - If port 8080 is already used, modify the docker-compose.yaml and change 8080 to your desired port

# Config

Using the app, you can tune 5 things.

- **Transmission Speed:** How quickly each individual character is written, high number is faster (changes on next send).
- **Crew Font Size:** How large the text on the Crew board is (immediate change)
- **Word Pause Multiplier:** The additional delay between each word, this time is multiplier (1-20X) on transmission speed.
- **Light Panel:** For the Muther/GM screen truns on the light themed screen for easier reading and writing.
- **All Caps:** Does what it says, makes everything on the crew board show in all caps.

# Usage

- **Macros:** Macros are pre-written text you can stage text in, hit transmit to send them to the main chat text box, then hit send.
- **Export Chat Log:** Exports the current chat log.
- **Save Session:** Saves the current chat log, and all premade macros.
- **Sessions:** Shows all saved sessions.
  - **Load:** Loads the selected session, repopulates the chat window for both Crew and Muther.
  - **Del:** Deletes the saved session.

# Images
<img width="1510" height="942" alt="image" src="https://github.com/user-attachments/assets/b84d19a9-6ac4-46e7-a473-b1df3acf9552" />
<img width="3818" height="1911" alt="image" src="https://github.com/user-attachments/assets/0cacffdf-6131-4e79-9abd-e7816148dbbc" />


https://github.com/user-attachments/assets/26e88b99-6446-43f5-bedf-08c98f2b5ba3


