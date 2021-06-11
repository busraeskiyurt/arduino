void setup() {       
  pinMode(7, OUTPUT);   
}   
void loop() {        
  digitalWrite(7, HIGH);  //we light the led    
  delay(1000);     
  digitalWrite(7, LOW);  //we turn off the led     
  delay(1000);  //wait for 1 second
} 
