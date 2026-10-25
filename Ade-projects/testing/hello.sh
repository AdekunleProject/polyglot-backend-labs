# The read CommandThis command is fundamental for collecting input from the user. 
# When encountered in a script, 
# it pauses execution and waits for the user to type something and press Enter.

# The -p OptionThe -p option allows you to specify a custom prompt that will be displayed to the user before 
# they enter their input. This makes your script's interaction clear and user-friendly.

#!/bin/bash
read -p "Enter your name: " name
echo "Hello, $name!

