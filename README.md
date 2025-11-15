# ESP32 Node Editor Frontend

This is but a part of the team software engineering project we underwent at the University Campus North Lincolnshire in 2024.

Originally published in a private repository under https://github.com/orgs/Team-Software-Project/repositories, I contributed most of the frontend under https://github.com/NotAuhrii, Richard Ball (https://github.com/kicomoco) contributed the backend (not included here), and Matthew Nicholls (https://github.com/40046873) contributed the serialisation and deserialisation functions and helped with interop communication and standardisation.

This frontend is intended to be loaded onto the ESP32, acting as an access point and server, to provide a self-contained development environment. Node maps are saved to a JSON file, ready to be parsed and executed by the backend on the ESP32.

In hindsight, many optimisations could have been made; first and foremost, converting the fonts to .woff2 to save on storage space. Many planned features were also cut short by time constraints, including zoom support (using CSS scale) in the editor.
