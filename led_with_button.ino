  

#define Buton 2
#define Led 3

int buton_durumu = 0;

void setup() {

  pinMode(Buton, INPUT);
  pinMode(Led, OUTPUT);


}

void loop() {

  buton_durumu = digitalRead(Buton);

  if(buton_durumu == 1)   //If the button is pressed(1), the LED will turn on.
  digitalWrite(Led,HIGH);
  else
  
  digitalWrite(Led,LOW);  //if the button is not pressed(0) it will not light up
}
