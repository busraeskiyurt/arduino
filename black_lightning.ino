int delaytime;
#define pot A0
int ledler[] = {3,4,5,6,7,8}; 

void setup() {
  Serial.begin(9600);  //serial port printing code
  pinMode(pot, INPUT);
  for(int i=0; i<7; i++){
  pinMode(ledler[i], OUTPUT); 
    
  }
}

void loop() {
  
  delaytime = analogRead(pot);  //We set the variable named "delay time" as the potentiometer value.
  delaytime=map(delaytime,0,1023,1000,2000);  //We can change the "delay time" value between 100 and 200.
  
  
  for(int i=0; i<7; i++){  //For every "i" value less than 6, it turns on the led and increases "i".
    Serial.println(delaytime);  //serial port printing code
    digitalWrite(ledler[i], HIGH);
    delay(delaytime);
    digitalWrite(ledler[i], LOW);
    
  }
  for(int j=6; j>-1; j--){  //For every "i" value more than -1, it turns on the led and decreases "i".
    Serial.println(delaytime);  //serial port printing code
    digitalWrite(ledler[j], HIGH);
    delay(delaytime);
    digitalWrite(ledler[j], LOW);
    
    
  }
  
}
