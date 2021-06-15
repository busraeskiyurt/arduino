#define led 3
#define pot A0


void setup() {

}

void loop() {

  int value = analogRead(pot);
  value = value/4;      //We divide to 4. because in this way, we will be take to obtain a  value between 1 and maximum 255.
  analogWrite(led,value);   //here we send the value to led.
  


}
