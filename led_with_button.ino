  

#define Button 2
#define Led 3

int button status = 0;

void setup() {

  pinMode(Button, INPUT);
  pinMode(Led, OUTPUT);


}

void loop() {

  button status = digitalRead(Button);

  if(button status == 1)   //If the button is pressed(1), the LED will turn on.
  digitalWrite(Led,HIGH);
  else
  
  digitalWrite(Led,LOW);  //if the button is not pressed(0) it will not light up
}
