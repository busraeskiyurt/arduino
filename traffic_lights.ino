void setup() {
  pinMode (8, OUTPUT);     
  pinMode (9, OUTPUT);
  pinMode (10, OUTPUT);
}

void loop() {
  digitalWrite(8, HIGH);   //We burning led 8. We turn off the others.
  digitalWrite(9, LOW);
  digitalWrite(10, LOW);
  delay(3000);              //Here we wait for 3 seconds.

  digitalWrite(8, LOW);    //We burning led 9. We turn off the others.
  digitalWrite(9, HIGH);
  digitalWrite(10, LOW);
  delay(1000);              //Here we wait for 1 seconds.

  digitalWrite(8, LOW);     //We burning led 10. We turn off the others.
  digitalWrite(9, LOW);
  digitalWrite(10, HIGH);
  delay(3000);              //Here we wait for 3 seconds.

}
